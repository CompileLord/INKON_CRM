import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User
from app.services.sms.sender import PayomchiSmsSender, SmsDeliveryError
from app.tests.sms_test_support import SmsPasswordTestSupport
from app.tests.sms_fakes import FakeSmsSender
from app.workers.outbox import OutboxWorkerManager


@pytest.mark.asyncio
async def test_transient_failure_retries_with_backoff_and_reuses_idempotency_key(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    user_id: int = created.json()["id"]
    sender: FakeSmsSender = FakeSmsSender([SmsDeliveryError("provider_http_503", retryable=True)])
    worker: OutboxWorkerManager = SmsPasswordTestSupport.build_worker(sender)
    factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()

    await worker.run_once(factory)
    event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
    assert event.status == OutboxEventStatus.PENDING
    assert event.attempt_count == 1 and event.last_error == "provider_http_503"
    assert event.encrypted_payload is not None
    assert event.next_attempt_at is not None and event.next_attempt_at > datetime.now(timezone.utc) + timedelta(seconds=5)

    await db_session.execute(text("UPDATE outbox_events SET next_attempt_at = now() WHERE id = :id"), {"id": event.id})
    await db_session.commit()
    await worker.run_once(factory)
    event = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
    assert event.status == OutboxEventStatus.DELIVERED
    assert len(sender.sends) == 2
    assert sender.sends[0].idempotency_key == sender.sends[1].idempotency_key == f"password-sms-{event.id}"
    assert sender.sends[0].message == sender.sends[1].message


@pytest.mark.asyncio
async def test_permanent_failure_is_terminal_and_payload_purged(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    sender: FakeSmsSender = FakeSmsSender([SmsDeliveryError("provider_status_rejected", retryable=False)])
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0]
    assert event.status == OutboxEventStatus.FAILED
    assert event.last_error == "provider_status_rejected"
    assert event.encrypted_payload is None
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    assert len(sender.sends) == 1


@pytest.mark.asyncio
async def test_max_attempts_cap_ends_in_failed(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    user_id: int = created.json()["id"]
    sender: FakeSmsSender = FakeSmsSender([SmsDeliveryError("provider_http_500", retryable=True) for _ in range(10)])
    worker: OutboxWorkerManager = SmsPasswordTestSupport.build_worker(sender)
    factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()
    for _ in range(10):
        await worker.run_once(factory)
        await db_session.execute(text("UPDATE outbox_events SET next_attempt_at = now() WHERE kind = 'student_password_sms'"))
        await db_session.commit()
    event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
    assert event.status == OutboxEventStatus.FAILED
    assert len(sender.sends) == event.max_attempts == 6


@pytest.mark.asyncio
async def test_concurrent_workers_send_each_event_exactly_once(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    for index in range(6):
        assert (await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, f"+99290000010{index}")).status_code == 201
    sender: FakeSmsSender = FakeSmsSender()
    factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()
    await asyncio.gather(*(SmsPasswordTestSupport.build_worker(sender, batch_size=3).run_once(factory) for _ in range(4)))
    keys: list[str] = [send.idempotency_key for send in sender.sends]
    assert len(keys) == len(set(keys)) == 6


@pytest.mark.asyncio
async def test_initial_and_pending_code_can_both_be_delivered(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    user_id: int = created.json()["id"]
    resend: Response = await client.post(f"/api/v1/users/{user_id}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))
    assert resend.status_code == 200 and resend.json() == {"destination": "student_phone", "channel": "student_phone", "masked_phone": "***0001"}
    older: OutboxEvent
    newer: OutboxEvent
    older, newer = await SmsPasswordTestSupport.sms_events(db_session, user_id)
    sender: FakeSmsSender = FakeSmsSender()
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    older, newer = await SmsPasswordTestSupport.sms_events(db_session, user_id)
    assert older.status == OutboxEventStatus.DELIVERED
    assert newer.status == OutboxEventStatus.DELIVERED
    assert len(sender.sends) == 2


@pytest.mark.asyncio
async def test_resend_preserves_old_code_sessions_and_is_rate_limited(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    user_id: int = created.json()["id"]
    old_code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, user_id))[0])
    session_response: Response = await SmsPasswordTestSupport.login(client, "+992900000001", old_code)
    assert session_response.status_code == 200
    first: Response = await client.post(f"/api/v1/users/{user_id}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))
    assert first.status_code == 200
    assert old_code not in first.text
    assert (await SmsPasswordTestSupport.login(client, "+992900000001", old_code)).status_code == 200
    refresh: Response = await client.post("/api/v1/auth/refresh", json={"refresh_token": session_response.json()["refresh_token"]})
    assert refresh.status_code == 200
    second: Response = await client.post(f"/api/v1/users/{user_id}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))
    assert second.status_code == 429 and "Retry-After" in second.headers
    audit_rows: list[AuditLog] = list((await db_session.execute(select(AuditLog).where(AuditLog.field_name == "password_sms_queued", AuditLog.entity_id == user_id))).scalars().all())
    assert len(audit_rows) == 2


@pytest.mark.asyncio
async def test_per_phone_hourly_and_daily_caps_block_shared_parent_phone_abuse(
    client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_RESEND_COOLDOWN_SECONDS", 1)
    monkeypatch.setattr(settings, "SMS_PASSWORD_PHONE_LIMIT", 5)
    ids: list[int] = []
    for index in range(3):
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, f"+9922{index}", "+992900000077")
        ids.append(created.json()["id"])
    statuses: list[int] = [
        (await client.post(f"/api/v1/users/{user_id}/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_admin))).status_code
        for user_id in ids
    ]
    assert statuses == [200, 200, 429]


@pytest.mark.asyncio
async def test_daily_phone_cap(client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_RESEND_COOLDOWN_SECONDS", 1)
    monkeypatch.setattr(settings, "SMS_PASSWORD_PHONE_DAILY_LIMIT", 3)
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99231", "+992900000078")
    other: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99232", "+992900000078")
    first: Response = await client.post(f"/api/v1/users/{created.json()['id']}/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_admin))
    second: Response = await client.post(f"/api/v1/users/{other.json()['id']}/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_admin))
    assert (first.status_code, second.status_code) == (200, 429)


@pytest.mark.asyncio
async def test_resend_is_staff_only_and_student_only(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User
) -> None:
    assert (await client.post(f"/api/v1/users/{test_student.id}/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_mentor))).status_code == 403
    assert (await client.post(f"/api/v1/users/{test_student.id}/resend-password-sms")).status_code in (401, 403)
    assert (await client.post(f"/api/v1/users/{test_mentor.id}/resend-password-sms", json={"channel": "student_phone"}, headers=SmsPasswordTestSupport.bearer(test_admin))).status_code == 422
    assert (await client.post("/api/v1/users/999999/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_admin))).status_code == 404
    assert (await client.get("/api/v1/users/password-sms-deliveries", headers=SmsPasswordTestSupport.bearer(test_mentor))).status_code == 403


@pytest.mark.asyncio
async def test_staff_sees_failed_deliveries_with_masked_phone_then_resends(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+992900004321")
    user_id: int = created.json()["id"]
    sender: FakeSmsSender = FakeSmsSender([SmsDeliveryError("provider_status_rejected", retryable=False)])
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    listing: Response = await client.get("/api/v1/users/password-sms-deliveries", headers=SmsPasswordTestSupport.bearer(test_admin))
    assert listing.status_code == 200
    rows: list[dict[str, Any]] = [row for row in listing.json() if row["user_id"] == user_id]
    assert len(rows) == 1
    assert rows[0]["status"] == "failed" and rows[0]["masked_phone"] == "***4321"
    assert rows[0]["last_error"] == "provider_status_rejected"
    assert "+992900004321" not in listing.text
    assert (await client.post(f"/api/v1/users/{user_id}/resend-password-sms", headers=SmsPasswordTestSupport.bearer(test_admin))).status_code == 200
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    assert len(sender.sends) == 2


@pytest.mark.asyncio
async def test_student_password_reset_sends_new_code_by_sms_without_enumeration(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None, "+99211", "+992900000055")
    user_id: int = created.json()["id"]
    known: Response = await client.post("/api/v1/auth/password-reset/request", json={"login": "+99211"})
    unknown: Response = await client.post("/api/v1/auth/password-reset/request", json={"login": "+99299"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()
    events: list[OutboxEvent] = await SmsPasswordTestSupport.sms_events(db_session, user_id)
    assert len(events) == 2
    assert events[1].recipient_phone == "+992900000055"
    new_code: str = SmsPasswordTestSupport.read_code(events[1])
    assert (await SmsPasswordTestSupport.login(client, "+99211", new_code)).status_code == 200
    again: Response = await client.post("/api/v1/auth/password-reset/request", json={"login": "+99211"})
    assert again.status_code == 200 and again.json() == known.json()
    assert len(await SmsPasswordTestSupport.sms_events(db_session, user_id)) == 2


@pytest.mark.asyncio
async def test_staff_password_reset_still_uses_email(client: AsyncClient, test_mentor: User, db_session: AsyncSession) -> None:
    response: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_mentor.email})
    assert response.status_code == 200
    assert await SmsPasswordTestSupport.sms_events(db_session) == []
    kinds: list[OutboxEventKind] = list((await db_session.execute(select(OutboxEvent.kind).where(OutboxEvent.recipient_email == test_mentor.email))).scalars().all())
    assert list(kinds) == [OutboxEventKind.PASSWORD_RESET_EMAIL]


@pytest.mark.asyncio
async def test_brute_force_of_code_is_locked_out(client: AsyncClient, test_admin: User, db_session: AsyncSession) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0])
    guesses: list[int] = [(await SmsPasswordTestSupport.login(client, "+992900000001", f"1234{index}Q")).status_code for index in range(settings.AUTH_LOGIN_LOCKOUT_LIMIT)]
    assert guesses == [401] * settings.AUTH_LOGIN_LOCKOUT_LIMIT
    assert (await SmsPasswordTestSupport.login(client, "+992900000001", code)).status_code == 429


@pytest.mark.asyncio
async def test_unconfigured_api_key_fails_permanently_without_network(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
    worker: OutboxWorkerManager = OutboxWorkerManager(
        settings.DATABASE_URL, settings.JWT_SECRET_KEY,
        sms_sender=PayomchiSmsSender(api_key=None), sms_send_interval_seconds=0,
    )
    await worker.run_once(SmsPasswordTestSupport.build_session_factory())
    event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0]
    assert event.status == OutboxEventStatus.FAILED and event.last_error == "sms_api_key_not_configured"


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
