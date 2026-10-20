import json
import os
import re
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.models.audit_log import AuditLog
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User
from app.services.outbox_service import OutboxPayloadEncryptor
from app.tests.sms_fakes import FakeSmsSender
from app.workers.outbox import OutboxWorkerManager

CODE_PATTERN: re.Pattern[str] = re.compile(r"^[0-9A-Z]{6}$")


def build_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"], pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


def bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def build_worker(sender: FakeSmsSender, **overrides: Any) -> OutboxWorkerManager:
    return OutboxWorkerManager(
        settings.DATABASE_URL,
        settings.JWT_SECRET_KEY,
        sms_sender=sender,
        sms_send_interval_seconds=0,
        sms_jitter_fraction=0,
        backoff_base_seconds=overrides.pop("backoff_base_seconds", 10),
        **overrides,
    )


async def create_student_via_api(
    client: AsyncClient,
    admin: User,
    email: str,
    phone: str | None = "+992900000001",
    parent_phone: str | None = None,
) -> Response:
    payload: dict[str, Any] = {"email": email, "first_name": "Sam", "last_name": "Student", "role": "student"}
    if phone is not None:
        payload["phone"] = phone
    if parent_phone is not None:
        payload["parent_phone"] = parent_phone
    return await client.post("/api/v1/users/", json=payload, headers=bearer(admin))


async def sms_events(db_session: AsyncSession, user_id: int | None = None) -> list[OutboxEvent]:
    db_session.expire_all()
    statement = select(OutboxEvent).where(OutboxEvent.kind == OutboxEventKind.STUDENT_PASSWORD_SMS).order_by(OutboxEvent.id)
    if user_id is not None:
        statement = statement.where(OutboxEvent.target_user_id == user_id)
    return list((await db_session.execute(statement)).scalars().all())


def read_code(event: OutboxEvent) -> str:
    assert event.encrypted_payload is not None
    decrypted: dict[str, Any] = json.loads(OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload))
    return str(decrypted["code"])


async def login(client: AsyncClient, email: str, password: str) -> Response:
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("phone", "parent_phone", "expected_destination", "expected_number"),
    [
        ("+992900000001", None, "student_phone", "+992900000001"),
        (None, "+992900000002", "parent_phone", "+992900000002"),
        ("+992900000001", "+992900000002", "student_phone", "+992900000001"),
    ],
)
async def test_destination_selection_and_delivery(
    client: AsyncClient, test_admin: User, db_session: AsyncSession,
    phone: str | None, parent_phone: str | None, expected_destination: str, expected_number: str,
) -> None:
    response: Response = await create_student_via_api(client, test_admin, "dest@example.com", phone, parent_phone)
    assert response.status_code == 201
    assert response.json()["password_sms_destination"] == expected_destination
    user_id: int = response.json()["id"]
    events: list[OutboxEvent] = await sms_events(db_session, user_id)
    assert len(events) == 1 and events[0].recipient_phone == expected_number
    code: str = read_code(events[0])
    sender: FakeSmsSender = FakeSmsSender()
    await build_worker(sender).run_once(build_session_factory())
    assert [(send.phone_e164, send.message) for send in sender.sends] == [(expected_number, f"KitobCRM: ваш пароль {code}")]
    assert code not in response.text
    refreshed: OutboxEvent = (await sms_events(db_session, user_id))[0]
    assert refreshed.status == OutboxEventStatus.DELIVERED
    assert refreshed.encrypted_payload is None
    assert refreshed.provider_message_id == "fake-1" and refreshed.provider_status == "sent"


@pytest.mark.asyncio
async def test_student_without_any_phone_is_rejected_with_422_and_nothing_created(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await create_student_via_api(client, test_admin, "nophone@example.com", None, None)
    assert response.status_code == 422
    assert (await db_session.execute(select(User).where(User.email == "nophone@example.com"))).scalar_one_or_none() is None
    assert await sms_events(db_session) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_phone", ["992900000001", "+9929000", "+992 900 000 001", "+0900000001", "tel"])
async def test_non_e164_phone_is_rejected_by_schema(client: AsyncClient, test_admin: User, bad_phone: str) -> None:
    response: Response = await create_student_via_api(client, test_admin, "bad@example.com", bad_phone)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_cannot_remove_last_phone_of_student(client: AsyncClient, test_admin: User) -> None:
    created: Response = await create_student_via_api(client, test_admin, "keep@example.com", "+992900000001")
    response: Response = await client.patch(
        f"/api/v1/users/{created.json()['id']}", json={"phone": None}, headers=bearer(test_admin)
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_staff_creation_keeps_email_credentials_flow(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    response: Response = await client.post(
        "/api/v1/users/",
        json={"email": "mentor.new@example.com", "first_name": "M", "last_name": "N", "role": "mentor"},
        headers=bearer(test_admin),
    )
    assert response.status_code == 201
    assert response.json()["password_sms_destination"] is None
    assert await sms_events(db_session) == []
    kinds: list[OutboxEventKind] = list(
        (await db_session.execute(select(OutboxEvent.kind).where(OutboxEvent.recipient_email == "mentor.new@example.com"))).scalars()
    )
    assert kinds == [OutboxEventKind.CREDENTIALS_EMAIL]


@pytest.mark.asyncio
async def test_sent_code_logs_in_wrong_code_fails_and_password_can_be_changed(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await create_student_via_api(client, test_admin, "login@example.com")
    code: str = read_code((await sms_events(db_session, created.json()["id"]))[0])
    wrong_code: str = "00000A" if code != "00000A" else "00000B"

    assert (await login(client, "login@example.com", wrong_code)).status_code == 401
    ok: Response = await login(client, "login@example.com", code)
    assert ok.status_code == 200 and ok.json()["must_set_password"] is True
    setup_headers: dict[str, str] = {"Authorization": f"Bearer {ok.json()['access_token']}"}
    blocked: Response = await client.get("/api/v1/users/me", headers=setup_headers)
    assert blocked.status_code == 403

    set_response: Response = await client.post(
        "/api/v1/auth/set-password", json={"new_password": "first-own-pass-1"}, headers=setup_headers
    )
    assert set_response.status_code == 200
    own_headers: dict[str, str] = {"Authorization": f"Bearer {set_response.json()['access_token']}"}
    bad_change: Response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "nope-nope-1", "new_password": "second-own-pass-2"},
        headers=own_headers,
    )
    assert bad_change.status_code == 401
    change: Response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "first-own-pass-1", "new_password": "second-own-pass-2"},
        headers=own_headers,
    )
    assert change.status_code == 200
    assert (await login(client, "login@example.com", "first-own-pass-1")).status_code == 401
    assert (await login(client, "login@example.com", "second-own-pass-2")).status_code == 200
    stale: Response = await client.get("/api/v1/users/me", headers=own_headers)
    assert stale.status_code == 401


@pytest.mark.asyncio
async def test_plaintext_code_never_stored_logged_audited_or_returned(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("DEBUG")
    created: Response = await create_student_via_api(client, test_admin, "secret@example.com")
    user_id: int = created.json()["id"]
    event: OutboxEvent = (await sms_events(db_session, user_id))[0]
    code: str = read_code(event)
    user: User = (await db_session.execute(select(User).where(User.id == user_id))).scalar_one()
    assert verify_password(code, user.password_hash)
    haystack: list[str] = [str(getattr(user, column.name)) for column in User.__table__.columns]
    haystack += [str(getattr(event, column.name)) for column in OutboxEvent.__table__.columns if column.name != "encrypted_payload"]
    audit_rows = (await db_session.execute(select(AuditLog).where(AuditLog.entity_id == user_id))).scalars().all()
    assert audit_rows
    haystack += [f"{row.field_name}{row.old_value}{row.new_value}" for row in audit_rows]
    haystack.append(created.text)
    haystack.append(caplog.text)
    assert all(code not in value for value in haystack)
    assert any(row.field_name == "password_sms_queued" and row.user_id == test_admin.id for row in audit_rows)
    await build_worker(FakeSmsSender()).run_once(build_session_factory())
    assert caplog.text.count(code) == 0


@pytest.mark.asyncio
async def test_siblings_sharing_parent_phone_get_distinct_codes(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    first: Response = await create_student_via_api(client, test_admin, "sib1@example.com", None, "+992900000009")
    second: Response = await create_student_via_api(client, test_admin, "sib2@example.com", None, "+992900000009")
    first_code: str = read_code((await sms_events(db_session, first.json()["id"]))[0])
    second_code: str = read_code((await sms_events(db_session, second.json()["id"]))[0])
    assert first_code != second_code
    assert (await login(client, "sib1@example.com", first_code)).status_code == 200
    assert (await login(client, "sib2@example.com", first_code)).status_code == 401
