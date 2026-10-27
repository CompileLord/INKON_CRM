from datetime import date
from typing import Callable
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.journal import JournalEntryUpdate
from app.services.journal_service import JournalService
from app.tests.integration.test_remediation_wp21 import create_journal


@pytest.fixture(autouse=True)
def school_day_2026_08_10(freeze_school_today: Callable[[date], None]) -> None:
    freeze_school_today(date(2026, 8, 10))


class AutosaveBoundsFixture:
    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    def cell(index: int = 0, comment: str | None = None) -> dict[str, Any]:
        return {
            "student_id": index + 1,
            "lesson_date": "2026-08-01",
            "attendance": False,
            "score": 0,
            "comment": comment,
            "version": 1,
        }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["identical_duplicate", "conflicting_duplicate", "normalized_duplicate", "too_many", "long_comment"]
)
async def test_invalid_autosave_rejected_before_service(
    client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    calls: int = 0
    original: Callable[..., Awaitable[dict[str, Any]]] = JournalService.batch_update_entries

    async def observed(service: JournalService, *args: Any, **kwargs: Any) -> dict[str, Any]:
        nonlocal calls
        calls += 1
        return await original(service, *args, **kwargs)

    monkeypatch.setattr(JournalService, "batch_update_entries", observed)
    payload: list[dict[str, Any]] = [AutosaveBoundsFixture.cell()]
    if kind == "too_many":
        payload = [AutosaveBoundsFixture.cell(index) for index in range(251)]
    elif kind == "long_comment":
        payload[0]["comment"] = "ж" * 1001
    else:
        payload.append(dict(payload[0]))
        if kind == "conflicting_duplicate":
            payload[1]["score"] = 5
        if kind == "normalized_duplicate":
            payload[1]["student_id"] = "1"
    response: Response = await client.put(
        "/api/v1/journals/999999/entries", headers=AutosaveBoundsFixture.headers(test_admin), json=payload
    )
    assert response.status_code == 422, response.text
    assert calls == 0


@pytest.mark.asyncio
async def test_oversize_body_rejected_before_json_without_draining_chunked_stream(client: AsyncClient) -> None:
    delivered: int = 0
    chunk: bytes = b" " * 65536

    async def chunks() -> AsyncIterator[bytes]:
        nonlocal delivered
        index: int
        for index in range(100):
            delivered += 1
            yield chunk

    response: Response = await client.put(
        "/api/v1/journals/1/entries", content=chunks(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert delivered == 65
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_declared_body_over_cap_rejected_without_reading(client: AsyncClient) -> None:
    delivered: int = 0

    async def chunks() -> AsyncIterator[bytes]:
        nonlocal delivered
        delivered += 1
        yield b"[]"

    response: Response = await client.put(
        "/api/v1/journals/1/entries",
        content=chunks(),
        headers={"Content-Type": "application/json", "Content-Length": "4194305"},
    )
    assert response.status_code == 413
    assert delivered == 0


@pytest.mark.asyncio
async def test_accepted_zero_comment_boundary_noop_and_partial_conflict_preserved(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User
) -> None:
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    headers: dict[str, str] = AutosaveBoundsFixture.headers(test_admin)
    payload: list[dict[str, Any]] = [update.model_dump(mode="json") for update in updates]
    payload[0]["comment"] = "🙂" * 1000
    payload[0]["score"] = 0
    payload[0]["attendance"] = False
    payload[1]["version"] += 999
    response: Response = await client.put(f"/api/v1/journals/{journal_id}/entries", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    assert len(data["applied"]) == 1 and len(data["conflicts"]) == 1
    assert data["applied"][0]["comment"] == "🙂" * 1000
    assert data["applied"][0]["score"] == 0
    version: int = data["applied"][0]["version"]
    response = await client.put(f"/api/v1/journals/{journal_id}/entries", headers=headers, json=[payload[0]])
    assert response.status_code == 200
    assert response.json()["applied"][0]["version"] == version
    empty: Response = await client.put(f"/api/v1/journals/{journal_id}/entries", headers=headers, json=[])
    assert empty.status_code == 200 and empty.json() == {"applied": [], "conflicts": [], "summaries": []}


class BodyProbe:
    def __init__(self) -> None:
        self.calls: int = 0
        self.body_bytes: int = 0

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        self.calls += 1
        while True:
            message: dict[str, Any] = await receive()
            self.body_bytes += len(message.get("body", b""))
            if not message.get("more_body", False):
                break
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})


class BodyLimitHarness:
    @staticmethod
    async def run(
        application: Any,
        messages: list[dict[str, Any]],
        headers: list[tuple[bytes, bytes]] | None = None,
        path: str = "/api/v1/journals/1/entries",
        method: str = "PUT",
        root_path: str = "",
    ) -> tuple[int, list[dict[str, Any]]]:
        consumed: int = 0
        sent: list[dict[str, Any]] = []

        async def receive() -> dict[str, Any]:
            nonlocal consumed
            message: dict[str, Any] = messages[consumed]
            consumed += 1
            return message

        async def send(message: dict[str, Any]) -> None:
            sent.append(message)

        await application(
            {"type": "http", "method": method, "path": path, "root_path": root_path, "headers": headers or []},
            receive,
            send,
        )
        return consumed, sent


@pytest.mark.asyncio
@pytest.mark.parametrize("length_header", ["missing", "truthful", "lying"])
@pytest.mark.parametrize("overflow", [False, True])
async def test_actual_byte_cap_boundary_independent_of_content_length(length_header: str, overflow: bool) -> None:
    from app.core.journal_body_limit import JournalBodyLimitMiddleware

    probe: BodyProbe = BodyProbe()
    application: JournalBodyLimitMiddleware = JournalBodyLimitMiddleware(probe, "/api/v1")
    total: int = 4194304 + int(overflow)
    headers: list[tuple[bytes, bytes]] = []
    if length_header != "missing":
        headers.append((b"content-length", str(total if length_header == "truthful" else 2).encode()))
    messages: list[dict[str, Any]] = [
        {"type": "http.request", "body": b"x" * 4194304, "more_body": True},
        {"type": "http.request", "body": b"x" if overflow else b"", "more_body": False},
    ]
    consumed: int
    sent: list[dict[str, Any]]
    consumed, sent = await BodyLimitHarness.run(application, messages, headers)
    assert sent[0]["status"] == (413 if overflow else 204)
    assert probe.calls == (0 if overflow else 1)
    assert probe.body_bytes == (0 if overflow else total)
    assert consumed == (0 if overflow and length_header == "truthful" else 2)


@pytest.mark.asyncio
async def test_first_oversize_chunk_and_disconnect_never_reach_downstream() -> None:
    from app.core.journal_body_limit import JournalBodyLimitMiddleware

    probe: BodyProbe = BodyProbe()
    application: JournalBodyLimitMiddleware = JournalBodyLimitMiddleware(probe, "/api/v1")
    consumed: int
    sent: list[dict[str, Any]]
    consumed, sent = await BodyLimitHarness.run(
        application,
        [
            {"type": "http.request", "body": b"x" * 4194305, "more_body": True},
            {"type": "http.request", "body": b"never read", "more_body": False},
        ],
    )
    assert consumed == 1 and sent[0]["status"] == 413 and probe.calls == 0
    consumed, sent = await BodyLimitHarness.run(
        application,
        [
            {"type": "http.request", "body": b"[", "more_body": True},
            {"type": "http.disconnect"},
        ],
    )
    assert consumed == 2 and sent == [] and probe.calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/v1/documents/upload"),
        ("POST", "/api/v1/courses/1/image/"),
        ("PUT", "/api/v1/other/1/entries"),
        ("POST", "/api/v1/journals/1/entries"),
    ],
)
async def test_unrelated_routes_and_upload_bodies_are_not_capped(method: str, path: str) -> None:
    from app.core.journal_body_limit import JournalBodyLimitMiddleware

    probe: BodyProbe = BodyProbe()
    application: JournalBodyLimitMiddleware = JournalBodyLimitMiddleware(probe, "/api/v1")
    consumed: int
    sent: list[dict[str, Any]]
    consumed, sent = await BodyLimitHarness.run(
        application,
        [{"type": "http.request", "body": b"x" * 4194305, "more_body": False}],
        [(b"content-length", b"4194305")],
        path,
        method,
    )
    assert consumed == 1 and sent[0]["status"] == 204 and probe.body_bytes == 4194305


@pytest.mark.asyncio
async def test_oversize_error_preserves_cors_and_security_headers() -> None:
    from app.main import app
    from starlette.middleware.cors import CORSMiddleware

    application: CORSMiddleware = CORSMiddleware(app, allow_origins=["http://localhost"])
    request_client: AsyncClient
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as request_client:
        response: Response = await request_client.put(
            "/api/v1/journals/1/entries",
            content=b"[]",
            headers={"Content-Length": "4194305", "Origin": "http://localhost"},
        )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"].startswith("no-store")


@pytest.mark.asyncio
@pytest.mark.parametrize("size", [1, 100, 250])
async def test_legitimate_unique_batch_capacities_apply_once(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User, size: int
) -> None:
    from decimal import Decimal
    from sqlalchemy import insert
    from app.models.enrollment import Enrollment
    from app.models.journal_entry import JournalEntry
    from app.models.journal_student_summary import JournalStudentSummary

    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    from app.models.journal import Journal

    journal: Journal | None = await db_session.get(Journal, journal_id)
    assert journal is not None
    students: list[int] = list(
        (
            await db_session.execute(
                insert(User).returning(User.id),
                [
                    {
                        "email": f"bounds{index}@example.invalid",
                        "first_name": "Bounded",
                        "last_name": str(index),
                        "role": "student",
                    }
                    for index in range(size)
                ],
            )
        ).scalars()
    )
    await db_session.execute(
        insert(Enrollment),
        [
            {
                "course_id": journal.course_id,
                "student_id": student_id,
                "price_at_enrollment": Decimal("100"),
                "color_hex": "#123456",
                "status": "active",
            }
            for student_id in students
        ],
    )
    await db_session.execute(
        insert(JournalEntry),
        [
            {
                "journal_id": journal_id,
                "student_id": student_id,
                "lesson_date": updates[0].lesson_date,
                "attendance": False,
                "score": 0,
                "is_graded": False,
            }
            for student_id in students
        ],
    )
    await db_session.execute(
        insert(JournalStudentSummary),
        [{"journal_id": journal_id, "student_id": student_id, "is_graded": False} for student_id in students],
    )
    await db_session.commit()
    payload: list[dict[str, Any]] = [
        dict(AutosaveBoundsFixture.cell(), student_id=student_id, lesson_date=str(updates[0].lesson_date))
        for student_id in students
    ]
    response: Response = await client.put(
        f"/api/v1/journals/{journal_id}/entries", json=payload, headers=AutosaveBoundsFixture.headers(test_admin)
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["applied"]) == size
    assert len(response.json()["summaries"]) == size
    assert response.json()["conflicts"] == []
    assert len({(entry["student_id"], entry["lesson_date"]) for entry in response.json()["applied"]}) == size


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path,root_path", [("/custom/journals/1/entries/", ""), ("/mounted/custom/journals/1/entries", "/mounted")]
)
async def test_configured_api_prefix_and_mounted_root_path_remain_bounded(path: str, root_path: str) -> None:
    from app.core.journal_body_limit import JournalBodyLimitMiddleware

    probe: BodyProbe = BodyProbe()
    application: JournalBodyLimitMiddleware = JournalBodyLimitMiddleware(probe, "/custom")
    consumed: int
    sent: list[dict[str, Any]]
    consumed, sent = await BodyLimitHarness.run(
        application, [], [(b"content-length", b"4194305")], path, "PUT", root_path
    )
    assert consumed == 0 and sent[0]["status"] == 413 and probe.calls == 0
