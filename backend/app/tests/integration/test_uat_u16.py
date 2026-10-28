import asyncio
import json
from typing import Any
import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, update
from app.core.config import settings
from app.models.outbox_event import OutboxEvent
from app.models.user import User
from app.services.outbox_service import OutboxPayloadEncryptor
from app.tests.integration.debt_reminder_support import add_debt, all_reminders, bearer, create_student, days_ago
from conftest import TestingSessionLocal


class ReminderScenario:
    @staticmethod
    async def student(mentor: User, parent: str | None, phone: str | None, chat: int | None = None, language: str = "en") -> int:
        student_id: int = await create_student("u16@example.com", chat)
        session: Any
        async with TestingSessionLocal() as session:
            await session.execute(update(User).where(User.id == student_id).values(
                parent_phone=parent, phone=phone, preferred_language=language,
            ))
            await session.commit()
        await add_debt(student_id, mentor.id, "Python", "1234.50", days_ago(3))
        return student_id

    @staticmethod
    async def send(client: AsyncClient, actor: User, student_id: int) -> Response:
        return await client.post("/api/v1/finance/debts/reminders", json={"student_ids": [student_id]}, headers=bearer(actor))

    @staticmethod
    async def events() -> list[OutboxEvent]:
        session: Any
        async with TestingSessionLocal() as session:
            return list((await session.scalars(select(OutboxEvent))).all())


@pytest.mark.asyncio
@pytest.mark.parametrize("parent,phone,chat,channel,destination", [
    ("+992900000001", "+992900000002", 777001, "telegram", "***7001"),
    ("+992900000001", "+992900000002", None, "sms", "+********0001"),
    (None, "+992900000002", None, "sms", "+********0002"),
])
async def test_channel_priority_and_history(client: AsyncClient, test_accountant: User, test_mentor: User,
                                          parent: str | None, phone: str | None, chat: int | None,
                                          channel: str, destination: str) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, parent, phone, chat)
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 200
    assert response.json()["results"][0]["channel"] == channel
    assert response.json()["results"][0]["masked_destination"] == destination
    assert (await all_reminders())[0].channel == channel
    debts: Response = await client.get("/api/v1/finance/debts/", headers=bearer(test_accountant))
    assert debts.status_code == 200
    assert debts.json()["items"][0]["reminder_channel"] == channel
    assert debts.json()["items"][0]["reminder_masked_destination"] == destination
    assert "+992900000001" not in debts.text
    assert "+992900000002" not in debts.text
    events: list[OutboxEvent] = await ReminderScenario.events()
    assert len(events) == (1 if channel == "sms" else 0)
    if channel == "sms":
        assert events[0].recipient_phone == (parent or phone)
        assert events[0].kind.value == "debt_reminder_sms"


@pytest.mark.asyncio
async def test_no_destination_returns_422(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, None, None)
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "debt_reminder_no_channel"
    assert await all_reminders() == []
    assert await ReminderScenario.events() == []


@pytest.mark.asyncio
async def test_rate_limit_crosses_channels(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None)
    assert (await ReminderScenario.send(client, test_accountant, student_id)).status_code == 200
    session: Any
    async with TestingSessionLocal() as session:
        await session.execute(update(User).where(User.id == student_id).values(parent_telegram_chat_id=777001))
        await session.commit()
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "debt_reminder_rate_limited"
    assert 0 < int(response.headers["Retry-After"]) <= 86400
    assert len(await all_reminders()) == 1


@pytest.mark.asyncio
async def test_two_concurrent_requests_send_once(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None)
    responses: list[Response] = await asyncio.gather(
        ReminderScenario.send(client, test_accountant, student_id),
        ReminderScenario.send(client, test_accountant, student_id),
    )
    assert sorted(response.status_code for response in responses) == [200, 429]
    assert len(await ReminderScenario.events()) == 1
    assert len(await all_reminders()) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("language,expected", [
    ("en", "IMKON: tuition debt 1234.50 TJS. Please pay. Thank you."),
    ("ru", "IMKON: долг за обучение 1234.50 TJS. Просим оплатить. Спасибо."),
    ("tg", "IMKON: қарзи таҳсил 1234.50 TJS. Лутфан пардохт кунед. Ташаккур."),
])
async def test_localized_decimal_sms(client: AsyncClient, test_accountant: User, test_mentor: User,
                                    language: str, expected: str) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None, language=language)
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 200
    event: OutboxEvent = (await ReminderScenario.events())[0]
    assert event.encrypted_payload is not None
    payload: dict[str, Any] = json.loads(OutboxPayloadEncryptor.from_settings(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload))
    assert payload["text"] == expected
    assert payload["language"] == language
    assert len(payload["text"]) <= (160 if language == "en" else 70)


@pytest.mark.asyncio
async def test_sms_delivery_uses_outbox_and_updates_history(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    from datetime import datetime, timezone
    from app.models.outbox_event import OutboxEventStatus
    from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
    from app.services.sms.sender import SmsSendResult
    from app.workers.outbox import OutboxWorkerManager

    class FakeSmsSender:
        messages: list[tuple[str, str, str]]

        def __init__(self) -> None:
            self.messages = []

        async def send(self, phone: str, message: str, idempotency_key: str) -> SmsSendResult:
            self.messages.append((phone, message, idempotency_key))
            return SmsSendResult(provider_message_id="fake-u16", status="accepted")

    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None)
    assert (await ReminderScenario.send(client, test_accountant, student_id)).status_code == 200
    sender: FakeSmsSender = FakeSmsSender()
    worker: OutboxWorkerManager = OutboxWorkerManager(
        database_url="unused", payload_master_key=settings.JWT_SECRET_KEY,
        sms_sender=sender, sms_send_interval_seconds=0,
    )
    session: Any
    async with TestingSessionLocal() as session:
        events: Any = await SQLAlchemyOutboxRepository(session).claim_pending_batch("u16", 180, 10, datetime.now(timezone.utc))
        await session.commit()
    assert await worker.process_single_event(events[0], "u16", TestingSessionLocal)
    assert sender.messages == [("+992900000001", "IMKON: tuition debt 1234.50 TJS. Please pay. Thank you.", f"debt-reminder-sms-{events[0].id}")]
    assert (await ReminderScenario.events())[0].status == OutboxEventStatus.DELIVERED
    assert (await all_reminders())[0].status == "sent"
    assert (await all_reminders())[0].sent_at is not None


@pytest.mark.asyncio
async def test_configured_interval_and_enrollment_history(test_mentor: User, test_accountant: User) -> None:
    from datetime import datetime, timedelta, timezone
    from fastapi import HTTPException
    from app.models.debt_reminder_notification import DebtReminderEnrollment
    from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
    from app.services.audit_service import AuditService
    from app.services.debt_reminder_service import DebtReminderService
    from app.tests.integration.debt_reminder_support import MutableClock

    student_id: int = await ReminderScenario.student(test_mentor, None, None, chat=777001)
    clock: MutableClock = MutableClock(datetime.now(timezone.utc))
    session: Any
    async with TestingSessionLocal() as session:
        service: DebtReminderService = DebtReminderService(SQLAlchemyDebtReminderRepository(session), AuditService(session), clock, interval_seconds=60)
        await service.queue([student_id], test_accountant.id)
        assert len(list((await session.scalars(select(DebtReminderEnrollment))).all())) == 1
        clock.moment += timedelta(seconds=59)
        error: pytest.ExceptionInfo[HTTPException]
        with pytest.raises(HTTPException) as error:
            await service.queue([student_id], test_accountant.id)
        assert error.value.status_code == 429
        clock.moment += timedelta(seconds=1)
        assert (await service.queue([student_id], test_accountant.id)).results[0].outcome == "queued"


@pytest.mark.asyncio
async def test_new_enrollment_is_not_limited_by_a_cleared_enrollment(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    from app.models.charge import Charge, ChargeStatus

    student_id: int = await ReminderScenario.student(test_mentor, None, None, chat=777001)
    assert (await ReminderScenario.send(client, test_accountant, student_id)).status_code == 200
    session: Any
    async with TestingSessionLocal() as session:
        await session.execute(update(Charge).where(Charge.student_id == student_id).values(status=ChargeStatus.CANCELLED))
        await session.commit()
    await add_debt(student_id, test_mentor.id, "New enrollment", "17.25", days_ago(1))
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 200
    assert len(await all_reminders()) == 2


@pytest.mark.asyncio
async def test_bulk_repeats_return_429(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    student_id: int = await ReminderScenario.student(test_mentor, None, None, chat=777001)
    other_id: int = await create_student("u16-other@example.com", 777002)
    await add_debt(other_id, test_mentor.id, "Other course", "17.25", days_ago(1))
    first: Response = await client.post("/api/v1/finance/debts/reminders", json={"student_ids": [student_id, other_id]}, headers=bearer(test_accountant))
    second: Response = await client.post("/api/v1/finance/debts/reminders", json={"student_ids": [student_id, other_id]}, headers=bearer(test_accountant))
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "debt_reminder_rate_limited"
    assert int(second.headers["Retry-After"]) > 0
    assert len(await all_reminders()) == 2


@pytest.mark.asyncio
async def test_expired_sms_updates_history(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    from datetime import datetime, timedelta, timezone
    from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository

    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None)
    assert (await ReminderScenario.send(client, test_accountant, student_id)).status_code == 200
    session: Any
    async with TestingSessionLocal() as session:
        assert await SQLAlchemyOutboxRepository(session).expire_stale(datetime.now(timezone.utc) + timedelta(days=2)) == 1
        await session.commit()
    assert (await all_reminders())[0].status == "failed"


@pytest.mark.asyncio
async def test_withdrawn_enrollment_remains_eligible_for_sms(client: AsyncClient, test_accountant: User, test_mentor: User) -> None:
    from app.models.enrollment import Enrollment, EnrollmentStatus
    from app.workers.debt_reminder_sms import DebtReminderSmsDispatcher

    student_id: int = await ReminderScenario.student(test_mentor, "+992900000001", None)
    assert (await ReminderScenario.send(client, test_accountant, student_id)).status_code == 200
    event: OutboxEvent = (await ReminderScenario.events())[0]
    assert event.encrypted_payload is not None
    payload: str = OutboxPayloadEncryptor.from_settings(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload)
    session: Any
    async with TestingSessionLocal() as session:
        await session.execute(update(Enrollment).where(Enrollment.student_id == student_id).values(status=EnrollmentStatus.WITHDRAWN))
        await session.commit()
    inspection: Any = await DebtReminderSmsDispatcher._inspect(None, event, payload, TestingSessionLocal)
    assert inspection.invalid_reason is None
    response: Response = await ReminderScenario.send(client, test_accountant, student_id)
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "debt_reminder_rate_limited"
