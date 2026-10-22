
import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password
from app.models.audit_log import AuditLog
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User
from app.tests.sms_fakes import FakeSmsSender
from app.tests.sms_test_support import SmsPasswordTestSupport

@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("phone", "parent_phone", "expected_destination", "expected_number", "message_template"),
    [
        ("+992900000001", None, "student_phone", "+992900000001", "KitobCRM: ваш пароль {code}"),
        ("+99211", "+992900000002", "parent_phone", "+992900000002", "KitobCRM: пароль для Sam: {code}"),
        ("+992900000001", "+992900000002", "student_phone", "+992900000001", "KitobCRM: ваш пароль {code}"),
    ],
)
async def test_destination_selection_and_delivery(
    client: AsyncClient, test_admin: User, db_session: AsyncSession,
    phone: str | None, parent_phone: str | None, expected_destination: str, expected_number: str,
    message_template: str,
) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, phone, parent_phone)
    assert response.status_code == 201
    assert response.json()["password_sms_destination"] == expected_destination
    user_id: int = response.json()["id"]
    events: list[OutboxEvent] = await SmsPasswordTestSupport.sms_events(db_session, user_id)
    assert len(events) == 1 and events[0].recipient_phone == expected_number
    code: str = SmsPasswordTestSupport.read_code(events[0])
    sender: FakeSmsSender = FakeSmsSender()
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    assert [(send.phone_e164, send.message) for send in sender.sends] == [(expected_number, message_template.format(code=code))]
    assert code not in response.text
    refreshed: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
    assert refreshed.status == OutboxEventStatus.DELIVERED
    assert refreshed.encrypted_payload is None
    assert refreshed.provider_message_id == "fake-1" and refreshed.provider_status == "sent"


@pytest.mark.asyncio
async def test_student_with_only_a_parent_phone_is_rejected_with_422_and_nothing_created(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, None, "+992900000002")
    assert response.status_code == 422
    detail: str = str(response.json()["detail"])
    assert "email" in detail and "phone" in detail
    assert (await db_session.execute(select(User).where(User.parent_phone == "+992900000002"))).scalar_one_or_none() is None
    assert await SmsPasswordTestSupport.sms_events(db_session) == []


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_phone", ["992900000001", "+1", "+992 900 000 001", "+0900000001", "+992٩٠٠٠٠٠٠٠١", "tel"])
async def test_non_e164_phone_is_rejected_by_schema(client: AsyncClient, test_admin: User, bad_phone: str) -> None:
    response: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, "bad@example.com", bad_phone)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_cannot_remove_last_phone_of_student(client: AsyncClient, test_admin: User) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+992900000001")
    response: Response = await client.patch(
        f"/api/v1/users/{created.json()['id']}", json={"phone": None}, headers=SmsPasswordTestSupport.bearer(test_admin)
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_staff_creation_keeps_email_credentials_flow(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    response: Response = await client.post(
        "/api/v1/users/",
        json={"email": "mentor.new@example.com", "first_name": "M", "last_name": "N", "role": "mentor"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert response.status_code == 201
    assert response.json()["password_sms_destination"] is None
    assert await SmsPasswordTestSupport.sms_events(db_session) == []
    kinds: list[OutboxEventKind] = list(
        (await db_session.execute(select(OutboxEvent.kind).where(OutboxEvent.recipient_email == "mentor.new@example.com"))).scalars()
    )
    assert kinds == [OutboxEventKind.CREDENTIALS_EMAIL]


@pytest.mark.asyncio
async def test_sent_code_logs_in_wrong_code_fails_and_password_can_be_changed(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0])
    wrong_code: str = "00000A" if code != "00000A" else "00000B"

    assert (await SmsPasswordTestSupport.login(client, "+992900000001", wrong_code)).status_code == 401
    ok: Response = await SmsPasswordTestSupport.login(client, "+992900000001", code)
    assert ok.status_code == 200 and ok.json()["must_set_password"] is True
    setup_headers: dict[str, str] = {"Authorization": f"Bearer {ok.json()['access_token']}"}
    blocked: Response = await client.get("/api/v1/users/me", headers=setup_headers)
    assert blocked.status_code == 403

    set_response: Response = await client.post(
        "/api/v1/auth/set-password",
        json={"new_password": "first-own-pass-1"}, headers=setup_headers
    )
    assert set_response.status_code == 200
    own_headers: dict[str, str] = {"Authorization": f"Bearer {set_response.json()['access_token']}"}
    bad_change: Response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "nope-nope-1", "new_password": "second-own-pass-2"},
        headers=own_headers,
    )
    assert bad_change.status_code == 400
    change: Response = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "first-own-pass-1", "new_password": "second-own-pass-2"},
        headers=own_headers,
    )
    assert change.status_code == 200
    assert (await SmsPasswordTestSupport.login(client, "+992900000001", "first-own-pass-1")).status_code == 401
    assert (await SmsPasswordTestSupport.login(client, "+992900000001", "second-own-pass-2")).status_code == 200
    stale: Response = await client.get("/api/v1/users/me", headers=own_headers)
    assert stale.status_code == 401


@pytest.mark.asyncio
async def test_plaintext_code_never_stored_logged_audited_or_returned(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("DEBUG")
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    user_id: int = created.json()["id"]
    event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
    code: str = SmsPasswordTestSupport.read_code(event)
    user: User = (await db_session.execute(select(User).where(User.id == user_id))).scalar_one()
    assert verify_password(code, user.password_hash)
    haystack: list[str] = [str(getattr(user, column.name)) for column in User.__table__.columns]
    haystack += [str(getattr(event, column.name)) for column in OutboxEvent.__table__.columns if column.name != "encrypted_payload"]
    audit_rows: list[AuditLog] = list((await db_session.execute(select(AuditLog).where(AuditLog.entity_id == user_id))).scalars().all())
    assert audit_rows
    haystack += [f"{row.field_name}{row.old_value}{row.new_value}" for row in audit_rows]
    haystack.append(created.text)
    haystack.append(caplog.text)
    assert all(code not in value for value in haystack)
    assert any(row.field_name == "password_sms_queued" and row.user_id == test_admin.id for row in audit_rows)
    await SmsPasswordTestSupport.build_worker(FakeSmsSender()).run_once(SmsPasswordTestSupport.build_session_factory())
    assert caplog.text.count(code) == 0


@pytest.mark.asyncio
async def test_siblings_sharing_parent_phone_get_distinct_codes(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    first: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99211", "+992900000009")
    second: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99212", "+992900000009")
    first_code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, first.json()["id"]))[0])
    second_code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, second.json()["id"]))[0])
    assert first_code != second_code
    assert (await SmsPasswordTestSupport.login(client, "+99211", first_code)).status_code == 200
    assert (await SmsPasswordTestSupport.login(client, "+99212", first_code)).status_code == 401


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
