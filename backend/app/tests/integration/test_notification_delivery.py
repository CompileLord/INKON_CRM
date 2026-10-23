from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
import asyncio
from datetime import date, datetime, tzinfo
from typing import Any
from unittest.mock import AsyncMock
import pytest
from httpx import AsyncClient, Response
from arq import Retry
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.notification_log import NotificationLog, NotificationType
from app.services.notification_service import NotificationService
from app.workers import tasks
from app.tests.integration.wp30_delivery_support import DeliveryFixture


@pytest.mark.asyncio
async def test_queue_acceptance_is_queued_until_transport_success(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    queued: NotificationLog = await DeliveryFixture.load()
    assert queued.delivery_state == "queued"
    assert queued.status == "failed"
    assert queued.sent_at is None
    assert queued.attempts == 0
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "message", notification_id=notification_id, revision=revision)
    delivered: NotificationLog = await DeliveryFixture.load()
    assert delivered.status == "sent"
    assert delivered.sent_at is not None
    assert delivered.attempts == 1
    sender.assert_awaited_once_with(998877, "message")


@pytest.mark.asyncio
async def test_queue_transport_failure_records_failed_and_retry(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    monkeypatch.setattr(tasks.bot, "send_message", AsyncMock(side_effect=RuntimeError("transport unavailable")))
    with pytest.raises(Retry):
        await tasks.send_telegram_message({}, 998877, "message", notification_id=notification_id, revision=revision)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.sent_at is None
    assert failed.claim_token is None


@pytest.mark.asyncio
async def test_repeat_after_transport_delivery_does_not_requeue(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 111, "wrong payload", notification_id, revision)
    sender.assert_awaited_once_with(998877, "message")
    enqueue: AsyncMock = AsyncMock()
    result: bool = await NotificationService(SQLAlchemyNotificationLogRepository(db_session)).queue_notification(
        "998877",
        NotificationType.EXAM_RESULT,
        41,
        DeliveryFixture.notification_date,
        enqueue,
        delivery_text="message",
    )
    assert result is False
    enqueue.assert_not_awaited()
    assert (await DeliveryFixture.load()).status == "sent"


@pytest.mark.asyncio
@pytest.mark.parametrize("error_kind", ["forbidden", "bad_request"])
async def test_permanent_transport_failure_is_terminal(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch, error_kind: str
) -> None:
    from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
    from aiogram.methods import SendMessage

    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    error_class: type[TelegramBadRequest] | type[TelegramForbiddenError] = (
        TelegramForbiddenError if error_kind == "forbidden" else TelegramBadRequest
    )
    sender: AsyncMock = AsyncMock(
        side_effect=error_class(method=SendMessage(chat_id=998877, text="message"), message="secret and personal data")
    )
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.is_terminal is True
    assert failed.error_message == error_class.__name__
    assert failed.attempts == 1
    assert sender.await_count == 1


@pytest.mark.asyncio
async def test_worker_retries_transient_failures_until_finite_budget(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    sender: AsyncMock = AsyncMock(side_effect=RuntimeError("sensitive information"))
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    attempt: int
    for attempt in range(2):
        with pytest.raises(Retry):
            await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.attempts == 3
    assert failed.error_message == "RuntimeError"
    assert sender.await_count == 3


@pytest.mark.asyncio
async def test_sender_timeout_fails_with_retry_before_lease_expiry(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    monkeypatch.setattr(NotificationService, "send_timeout_seconds", 0.01)
    assert NotificationService.send_timeout_seconds < NotificationService.lease_seconds
    blocker: asyncio.Event = asyncio.Event()

    async def sender(chat_id: int, text: str) -> None:
        await blocker.wait()

    monkeypatch.setattr(tasks.bot, "send_message", sender)
    with pytest.raises(Retry):
        await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.error_message == "TimeoutError"
    assert failed.claim_token is None


@pytest.mark.asyncio
async def test_delivery_log_projects_additive_delivery_state(db_session: AsyncSession) -> None:
    from app.schemas.notification import DeliveryLogResponse

    await DeliveryFixture.reserve(NotificationService(SQLAlchemyNotificationLogRepository(db_session)))
    log: NotificationLog = await DeliveryFixture.load()
    assert log.status == "failed"
    page: dict[str, Any] = await NotificationService(SQLAlchemyNotificationLogRepository(db_session)).get_delivery_log(1, 20, None)
    assert DeliveryLogResponse.model_validate(page["items"][0]).status == "queued"


@pytest.mark.asyncio
async def test_api_filters_and_projects_queued_and_inflight_states(
    db_session: AsyncSession, client: AsyncClient, test_admin: User
) -> None:
    from app.core.security import create_access_token

    enqueue: AsyncMock = AsyncMock()
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    assert (
        await service.queue_notification(
            "998877",
            NotificationType.EXAM_RESULT,
            42,
            DeliveryFixture.notification_date,
            enqueue,
            user_id=test_admin.id,
            delivery_text="message",
        )
        is True
    )
    log: NotificationLog = await DeliveryFixture.load()
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    inbox: Response = await client.get("/api/v1/notifications/", headers=headers)
    assert inbox.status_code == 200
    assert inbox.json()["items"] == []
    assert inbox.json()["total"] == 0
    queued: Response = await client.get("/api/v1/notifications/delivery-log?status=queued", headers=headers)
    assert queued.status_code == 200
    assert queued.json()["total"] == 1
    assert queued.json()["items"][0]["status"] == "queued"
    assert await service.claim_notification(log.id, log.revision or 1) is not None
    inflight: Response = await client.get("/api/v1/notifications/delivery-log?status=inflight", headers=headers)
    assert inflight.status_code == 200
    assert inflight.json()["total"] == 1
    assert inflight.json()["items"][0]["status"] == "inflight"
    queued = await client.get("/api/v1/notifications/delivery-log?status=queued", headers=headers)
    assert queued.json()["total"] == 0


@pytest.mark.asyncio
async def test_actual_reminder_enqueue_does_not_record_delivery(
    db_session: AsyncSession, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from decimal import Decimal
    from app.models.course import Course, CourseExamType, CourseStatus
    from app.models.enrollment import Enrollment, EnrollmentStatus

    await DeliveryFixture.reminder_source(db_session, test_student, test_mentor)

    class ReminderClock(datetime):
        @classmethod
        def now(cls, tz: tzinfo | None = None) -> datetime:
            return datetime(2026, 10, 19, 12, tzinfo=tz)

    monkeypatch.setattr(tasks, "datetime", ReminderClock)
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    await tasks.check_payment_reminders({})
    log: NotificationLog = await DeliveryFixture.load()
    assert log.status != "sent"
    assert log.sent_at is None
    assert log.delivery_state == "queued"
    assert enqueue.await_count == 1
    payload: dict[str, Any] = enqueue.call_args.kwargs
    assert payload["notification_id"] == log.id
    assert payload["revision"] == log.revision
    assert payload["_job_id"] == f"notification:{log.id}:{log.revision}:initial"
    sender: AsyncMock = AsyncMock(side_effect=RuntimeError("unavailable"))
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    payload.pop("_job_id")
    with pytest.raises(Retry):
        await tasks.send_telegram_message({}, **payload)
    assert (await DeliveryFixture.load()).status == "failed"


@pytest.mark.asyncio
async def test_notification_service_idempotency(db_session: AsyncSession) -> None:
    notification_service = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    recipient = "998877"
    notification_type = NotificationType.EXAM_RESULT
    related_entity_id = 1
    notification_date = date(2026, 7, 12)

    send_count = 0

    async def mock_send_func(is_update: bool) -> None:
        nonlocal send_count
        send_count += 1

    success1 = await notification_service.send_notification_with_idempotency(
        recipient=recipient,
        notification_type=notification_type,
        related_entity_id=related_entity_id,
        notification_date=notification_date,
        send_func=mock_send_func
    )
    assert success1 is True
    assert send_count == 1

    success2 = await notification_service.send_notification_with_idempotency(
        recipient=recipient,
        notification_type=notification_type,
        related_entity_id=related_entity_id,
        notification_date=notification_date,
        send_func=mock_send_func
    )
    assert success2 is False
    assert send_count == 1
