from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User, UserRole
from app.tests.integration.plink_support import PlinkApi, PlinkOutbox, PlinkUsers
from app.tests.sms_test_support import SmsPasswordTestSupport


@pytest.mark.asyncio
async def test_student_with_email_and_phone_gets_email_credentials_and_no_sms(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "E", "last_name": "P", "role": "student", "email": "both@example.com", "phone": "+992900000501",
    })
    assert response.status_code == 201
    body: dict[str, Any] = response.json()
    assert body["credentials_channel"] == "email"
    assert body["credentials_masked_phone"] is None and body["password_sms_destination"] is None
    assert await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS) == []
    assert [event.recipient_email for event in await PlinkOutbox.events(db_session, OutboxEventKind.CREDENTIALS_EMAIL)] == ["both@example.com"]
    assert body["must_set_password"] is True


@pytest.mark.asyncio
async def test_student_with_email_and_only_a_parent_phone_gets_email_credentials(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "E", "last_name": "Q", "role": "student", "email": "parented@example.com", "parent_phone": "+992900000502",
    })
    assert response.status_code == 201 and response.json()["credentials_channel"] == "email"
    assert await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS) == []


@pytest.mark.asyncio
async def test_phone_only_student_gets_sms_to_own_phone_with_masked_destination(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "P", "last_name": "O", "role": "student", "phone": "+992900004567", "parent_phone": "+992900000503",
    })
    body: dict[str, Any] = response.json()
    assert response.status_code == 201
    assert body["credentials_channel"] == "student_phone" and body["credentials_masked_phone"] == "***4567"
    assert body["password_sms_destination"] == "student_phone"
    events: list[OutboxEvent] = await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS, body["id"])
    assert [event.recipient_phone for event in events] == ["+992900004567"]
    assert await PlinkOutbox.events(db_session, OutboxEventKind.CREDENTIALS_EMAIL) == []


@pytest.mark.asyncio
async def test_student_without_deliverable_own_phone_gets_sms_to_parent_phone(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "P", "last_name": "R", "role": "student", "phone": "+99211", "parent_phone": "+992900008901",
    })
    body: dict[str, Any] = response.json()
    assert response.status_code == 201
    assert body["credentials_channel"] == "parent_phone" and body["credentials_masked_phone"] == "***8901"
    events: list[OutboxEvent] = await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS, body["id"])
    assert [event.recipient_phone for event in events] == ["+992900008901"]


@pytest.mark.asyncio
async def test_staff_creation_uses_email_and_reports_the_channel(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    response: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "M", "last_name": "N", "role": "mentor", "email": "mentor.plink@example.com", "phone": "+992900000504",
    })
    assert response.status_code == 201
    assert response.json()["credentials_channel"] == "email" and response.json()["credentials_masked_phone"] is None
    assert await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS) == []


@pytest.mark.asyncio
async def test_email_less_student_never_receives_any_email_outbox_event(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "N", "last_name": "E", "role": "student", "phone": "+992900000505",
    })
    student_id: int = created.json()["id"]
    await PlinkApi.resend(client, test_admin, student_id)
    await PlinkApi.reset(client, {"login": "+992900000505"})
    await PlinkApi.reset(client, {"login": "+992900000505", "channel": "student_phone"})
    await client.patch(f"/api/v1/users/{student_id}", json={"phone": "+992900000506"}, headers=SmsPasswordTestSupport.bearer(test_admin))
    kinds: set[OutboxEventKind] = set(await PlinkOutbox.all_kinds(db_session))
    assert kinds == {OutboxEventKind.STUDENT_PASSWORD_SMS}


@pytest.mark.asyncio
async def test_resend_defaults_to_the_priority_channel_per_account(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    with_email: User = await PlinkUsers.create(db_session, "resend.mail@example.com", "+992900000511")
    phone_only: User = await PlinkUsers.create(db_session, None, "+992900000512")
    mailed: Response = await PlinkApi.resend(client, test_admin, with_email.id)
    texted: Response = await PlinkApi.resend(client, test_admin, phone_only.id)
    assert mailed.status_code == 200 and mailed.json() == {"destination": None, "channel": "email", "masked_phone": None}
    assert texted.json() == {"destination": "student_phone", "channel": "student_phone", "masked_phone": "***0512"}
    assert len(await PlinkOutbox.events(db_session, OutboxEventKind.CREDENTIALS_EMAIL)) == 1
    assert [e.recipient_phone for e in await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS)] == ["+992900000512"]


@pytest.mark.asyncio
async def test_resend_honours_an_explicit_channel_and_rejects_a_missing_one(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    student: User = await PlinkUsers.create(db_session, "chan@example.com", "+992900000521", "+992900000522")
    no_parent: User = await PlinkUsers.create(db_session, None, "+992900000523")
    parent: Response = await PlinkApi.resend(client, test_admin, student.id, {"channel": "parent_phone"})
    own: Response = await PlinkApi.resend(client, test_admin, student.id, {"channel": "student_phone"})
    missing: Response = await PlinkApi.resend(client, test_admin, no_parent.id, {"channel": "parent_phone"})
    no_email: Response = await PlinkApi.resend(client, test_admin, no_parent.id, {"channel": "email"})
    assert (parent.json()["channel"], parent.json()["masked_phone"]) == ("parent_phone", "***0522")
    assert own.status_code == 429
    assert missing.status_code == 422 and no_email.status_code == 422
    recipients: list[str | None] = [e.recipient_phone for e in await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS)]
    assert recipients == ["+992900000522"]


@pytest.mark.asyncio
async def test_resend_to_staff_allows_only_the_email_channel(
    client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession
) -> None:
    test_mentor.phone = "+992900000531"
    db_session.add(test_mentor)
    await db_session.commit()
    by_email: Response = await PlinkApi.resend(client, test_admin, test_mentor.id, {"channel": "email"})
    by_default: Response = await PlinkApi.resend(client, test_admin, test_mentor.id)
    by_phone: Response = await PlinkApi.resend(client, test_admin, test_mentor.id, {"channel": "student_phone"})
    by_parent: Response = await PlinkApi.resend(client, test_admin, test_mentor.id, {"channel": "parent_phone"})
    assert (by_email.status_code, by_default.status_code) == (200, 200)
    assert by_phone.status_code == 422 and by_parent.status_code == 422
    assert await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS) == []


@pytest.mark.asyncio
async def test_resend_is_audited_with_the_actor_for_both_channel_kinds(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    mailed: User = await PlinkUsers.create(db_session, "audit.mail@example.com", None)
    texted: User = await PlinkUsers.create(db_session, None, "+992900000541")
    await PlinkApi.resend(client, test_admin, mailed.id)
    await PlinkApi.resend(client, test_admin, texted.id)
    rows: list[AuditLog] = list((await db_session.execute(select(AuditLog).where(AuditLog.user_id == test_admin.id))).scalars().all())
    by_entity: dict[int, set[str]] = {}
    for row in rows:
        by_entity.setdefault(row.entity_id, set()).add(f"{row.field_name}={row.new_value}")
    assert by_entity[mailed.id] == {"credentials_queued=reset:email"}
    assert by_entity[texted.id] == {"password_sms_queued=reset:student_phone"}


@pytest.mark.asyncio
async def test_resend_sms_path_goes_through_account_limit(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_ACCOUNT_LIMIT", 1)
    monkeypatch.setattr(settings, "SMS_PASSWORD_RESEND_COOLDOWN_SECONDS", 1)
    student: User = await PlinkUsers.create(db_session, None, "+992900000551")
    first: Response = await PlinkApi.resend(client, test_admin, student.id)
    second: Response = await PlinkApi.resend(client, test_admin, student.id)
    assert (first.status_code, second.status_code) == (200, 429)


@pytest.mark.asyncio
async def test_email_change_before_first_login_follows_priority_and_removal_falls_back_to_sms(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "C", "last_name": "H", "role": "student", "email": "first@example.com", "phone": "+992900000561",
    })
    student_id: int = created.json()["id"]
    removal: Response = await client.patch(f"/api/v1/users/{student_id}", json={"email": None}, headers=SmsPasswordTestSupport.bearer(test_admin))
    assert removal.status_code == 200 and removal.json()["email"] is None
    sms_events: list[OutboxEvent] = await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS, student_id)
    assert [event.recipient_phone for event in sms_events] == ["+992900000561"]
    assert len(await PlinkOutbox.events(db_session, OutboxEventKind.CREDENTIALS_EMAIL)) == 1


@pytest.mark.asyncio
async def test_email_change_audit_row_records_old_and_new_email(
    client: AsyncClient, test_admin: User, test_student: User, db_session: AsyncSession
) -> None:
    response: Response = await client.patch(
        f"/api/v1/users/{test_student.id}", json={"email": "audited.new@example.com"}, headers=SmsPasswordTestSupport.bearer(test_admin)
    )
    assert response.status_code == 200
    rows: list[AuditLog] = list((await db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == test_student.id, AuditLog.field_name == "email")
    )).scalars().all())
    assert [(row.old_value, row.new_value, row.user_id) for row in rows] == [("student@example.com", "audited.new@example.com", test_admin.id)]
    assert await PlinkOutbox.all_kinds(db_session) == []


@pytest.mark.asyncio
async def test_verification_for_an_sms_student_is_a_uniform_not_requested_error(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    sms_student: User = await PlinkUsers.create(db_session, None, "+992900000571")
    unknown: Response = await client.post("/api/v1/auth/verify-code", json={"email": "ghost.plink@example.com", "code": "123456"})
    emailed: Response = await client.post("/api/v1/auth/verify-code", json={"email": "student@example.com", "code": "123456"})
    assert unknown.status_code == emailed.status_code == 400
    assert unknown.json() == emailed.json()
    assert sms_student.must_set_password is False


@pytest.mark.asyncio
async def test_resend_code_is_uniform_for_missing_active_and_pending_accounts(
    client: AsyncClient, test_student: User, test_admin: User
) -> None:
    created: Response = await PlinkApi.create_user(client, test_admin, {
        "first_name": "R", "last_name": "C", "role": "mentor", "email": "pending.plink@example.com",
    })
    assert created.status_code == 201
    bodies: list[Response] = [
        await client.post("/api/v1/auth/resend-code", json={"email": email})
        for email in ("ghost.plink@example.com", test_student.email, "pending.plink@example.com")
    ]
    assert {(response.status_code, response.text) for response in bodies} == {(204, "")}


@pytest.mark.asyncio
async def test_user_responses_serialize_a_student_without_email(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    student: User = await PlinkUsers.create(db_session, None, "+992900000581")
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    own: Response = await client.get("/api/v1/users/me", headers=SmsPasswordTestSupport.bearer(student))
    listing: Response = await client.get("/api/v1/students/?search=0581", headers=headers)
    assert own.status_code == 200 and own.json()["email"] is None
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [student.id]
    assert listing.json()["items"][0]["email"] is None
    assert UserRole.STUDENT.value == own.json()["role"]


@pytest.mark.asyncio
async def test_student_search_matches_own_phone_and_parent_phone_separately(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    own_phone_student: User = await PlinkUsers.create(db_session, None, "+992900771111")
    parent_phone_student: User = await PlinkUsers.create(db_session, None, "+992900772222", parent_phone="+992900773333")
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    by_own_phone: Response = await client.get("/api/v1/students/?search=771111", headers=headers)
    by_parent_phone: Response = await client.get("/api/v1/students/?search=773333", headers=headers)
    assert [item["id"] for item in by_own_phone.json()["items"]] == [own_phone_student.id]
    assert [item["id"] for item in by_parent_phone.json()["items"]] == [parent_phone_student.id]


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
