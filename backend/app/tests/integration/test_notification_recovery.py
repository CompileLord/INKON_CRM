from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.journal import Journal
from app.models.enrollment import Enrollment
from app.repositories.interfaces.notification_log_repository import NotificationClaim
from app.models.notification_log import NotificationLog, NotificationType
from app.services.notification_service import NotificationService
from app.workers import tasks
from app.tests.integration.wp30_delivery_support import DeliveryFixture


@pytest.mark.asyncio
async def test_worker_recovers_expired_claim(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    abandoned: NotificationClaim | None = await service.claim_notification(notification_id, revision)
    assert abandoned is not None
    await db_session.execute(
        update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    assert (await DeliveryFixture.load()).status == "sent"
    assert await service.finalize_notification(abandoned, "RuntimeError") is False
    sender.assert_awaited_once_with(998877, "message")


@pytest.mark.asyncio
async def test_durable_sweep_recovers_enqueue_failure(
    db_session: AsyncSession, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    enrollment: Enrollment = await DeliveryFixture.reminder_source(db_session, test_student, test_mentor)
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    enqueue_failure: AsyncMock = AsyncMock(side_effect=RuntimeError("redis unavailable"))
    with pytest.raises(RuntimeError):
        await service.queue_notification(
            "998877",
            NotificationType.PAYMENT_REMINDER_1D,
            enrollment.id,
            DeliveryFixture.notification_date,
            enqueue_failure,
            delivery_text="durable message",
            user_id=test_student.id,
        )
    queued: NotificationLog = await DeliveryFixture.load()
    assert queued.delivery_state == "queued"
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    assert await tasks.recover_notification_deliveries({}) == 1
    first_payload: dict[str, Any] = enqueue.call_args.kwargs
    assert first_payload["notification_id"] == queued.id
    assert first_payload["revision"] == queued.revision
    first_job_id: str = first_payload["_job_id"]
    assert await tasks.recover_notification_deliveries({}) == 1
    assert enqueue.call_args.kwargs["_job_id"] == first_job_id
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, first_payload["chat_id"], first_payload["text"], queued.id, queued.revision)
    sender.assert_awaited_once_with(998877, "durable message")
    assert await tasks.recover_notification_deliveries({}) == 0


@pytest.mark.asyncio
async def test_cancelled_sender_recovers_through_sweep_and_worker(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    entered: asyncio.Event = asyncio.Event()
    blocker: asyncio.Event = asyncio.Event()

    async def abandoned_sender(chat_id: int, text: str) -> None:
        entered.set()
        await blocker.wait()

    monkeypatch.setattr(tasks.bot, "send_message", abandoned_sender)
    running: asyncio.Task[None] = asyncio.create_task(
        tasks.send_telegram_message({}, 998877, "message", notification_id, revision)
    )
    await asyncio.wait_for(entered.wait(), 5)
    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await running
    abandoned: NotificationLog = await DeliveryFixture.load()
    assert abandoned.delivery_state == "inflight"
    stale_token: str | None = abandoned.claim_token
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    assert await tasks.recover_notification_deliveries({}) == 0
    await db_session.execute(
        update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()
    assert await tasks.recover_notification_deliveries({}) == 1
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    payload: dict[str, Any] = enqueue.call_args.kwargs
    payload.pop("_job_id")
    await tasks.send_telegram_message({}, **payload)
    delivered: NotificationLog = await DeliveryFixture.load()
    assert delivered.status == "sent"
    assert delivered.attempts == 2
    assert delivered.claim_token is None
    assert stale_token is not None
    sender.assert_awaited_once_with(998877, "message")


@pytest.mark.asyncio
async def test_cancelled_legacy_exam_delivery_recovers_through_sweep(
    db_session: AsyncSession, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from decimal import Decimal
    from app.models.course import Course, CourseExamType, CourseStatus
    from app.models.journal import Journal, JournalPeriodType
    from app.models.journal_student_summary import JournalStudentSummary
    from app.repositories.interfaces.notification_log_repository import NotificationClaim

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    entered: asyncio.Event = asyncio.Event()
    blocker: asyncio.Event = asyncio.Event()

    async def abandoned_sender(chat_id: int, text: str) -> None:
        entered.set()
        await blocker.wait()

    monkeypatch.setattr(tasks.bot, "send_message", abandoned_sender)
    running: asyncio.Task[None] = asyncio.create_task(
        tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    )
    await asyncio.wait_for(entered.wait(), 5)
    running.cancel()
    with pytest.raises(asyncio.CancelledError):
        await running
    abandoned: NotificationLog = await DeliveryFixture.load()
    assert abandoned.delivery_state == "inflight"
    assert abandoned.delivery_text is None
    assert abandoned.claim_token is not None
    stale: NotificationClaim = NotificationClaim(
        abandoned.id,
        abandoned.revision,
        abandoned.claim_token,
        abandoned.attempts,
        False,
        abandoned.delivery_score,
        abandoned.recipient,
        None,
    )
    await db_session.execute(
        update(NotificationLog).values(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    assert await tasks.recover_notification_deliveries({}) == 1
    assert enqueue.call_args.args == ("send_exam_result_notification_task",)
    payload: dict[str, Any] = enqueue.call_args.kwargs
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_exam_result_notification_task({}, **payload)
    assert (await DeliveryFixture.load()).status == "sent"
    assert (await DeliveryFixture.load()).attempts == 2
    sender.assert_awaited_once()
    assert (
        await NotificationService(SQLAlchemyNotificationLogRepository(db_session)).finalize_notification(stale, None)
        is False
    )


@pytest.mark.asyncio
async def test_real_arq_deduplicates_pending_and_recovers_preclaim_failure(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    import uuid
    from arq import create_pool, func
    from arq.connections import ArqRedis, RedisSettings
    from arq.jobs import Job
    from arq.worker import Worker
    from app.tests.conftest import TEST_REDIS_URL

    notification_id: int
    revision: int
    notification_id, revision = await DeliveryFixture.reserve(
        NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    )
    prefix: str = f"wp30:{uuid.uuid4().hex}:"
    queue_name: str = f"{prefix}queue"
    pool: ArqRedis = await create_pool(RedisSettings.from_dsn(TEST_REDIS_URL))
    enqueued: list[Job | None] = []

    async def enqueue(job_name: str, payload: dict[str, Any]) -> None:
        arguments: dict[str, Any] = dict(payload)
        arguments["_job_id"] = prefix + arguments["_job_id"]
        enqueued.append(await pool.enqueue_job(job_name, _queue_name=queue_name, **arguments))

    async def crash_before_claim(ctx: dict[str, Any], **kwargs: Any) -> None:
        raise RuntimeError("crashed before claim")

    first: Worker = Worker(
        [func(crash_before_claim, name="send_telegram_message", keep_result=0)],
        redis_pool=pool,
        queue_name=queue_name,
        burst=True,
        handle_signals=False,
        poll_delay=0.01,
    )
    second: Worker = Worker(
        [func(tasks.send_telegram_message, keep_result=0)],
        redis_pool=pool,
        queue_name=queue_name,
        burst=True,
        handle_signals=False,
        poll_delay=0.01,
    )
    try:
        service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
        assert await service.recover_deliveries(enqueue) == 1
        assert await service.recover_deliveries(enqueue) == 1
        assert enqueued[0] is not None
        assert enqueued[1] is None
        await asyncio.wait_for(first.async_run(), 10)
        assert first.jobs_failed == 1
        assert (await DeliveryFixture.load()).attempts == 0
        assert await service.recover_deliveries(enqueue) == 1
        assert enqueued[2] is not None
        sender: AsyncMock = AsyncMock()
        monkeypatch.setattr(tasks.bot, "send_message", sender)
        await asyncio.wait_for(second.async_run(), 10)
        assert second.jobs_complete == 1
        assert (await DeliveryFixture.load()).status == "sent"
        sender.assert_awaited_once_with(998877, "message")
    finally:
        await first.close()
        await second.close()
        await pool.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("deleted_source", ["student", "course"])
async def test_recovery_terminalizes_deleted_source_without_transport(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
    deleted_source: str,
) -> None:
    from app.models.course import Course

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    enqueue: AsyncMock = AsyncMock()
    assert (
        await service.queue_notification(
            "998877",
            NotificationType.EXAM_RESULT,
            journal.id,
            DeliveryFixture.notification_date,
            enqueue,
            score_val=10,
            user_id=test_student.id,
        )
        is True
    )
    if deleted_source == "student":
        await db_session.execute(update(User).where(User.id == test_student.id).values(is_deleted=True))
    else:
        await db_session.execute(update(Course).where(Course.id == journal.course_id).values(is_deleted=True))
    await db_session.commit()
    recovered: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", recovered)
    assert await tasks.recover_notification_deliveries({}) == 1
    payload: dict[str, Any] = recovered.call_args.kwargs
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_exam_result_notification_task({}, **payload)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.is_terminal is True
    assert failed.error_message == "source_deleted"
    sender.assert_not_awaited()
    assert await tasks.recover_notification_deliveries({}) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "source_change",
    ["student_deleted", "enrollment_deleted", "course_deleted", "guardian_changed", "enrollment_owner_changed"],
)
async def test_reminder_worker_rejects_deleted_or_reassigned_source(
    db_session: AsyncSession, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch, source_change: str
) -> None:
    from app.models.course import Course

    enrollment: Enrollment = await DeliveryFixture.reminder_source(db_session, test_student, test_mentor)
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    enqueue: AsyncMock = AsyncMock()
    assert (
        await service.queue_notification(
            "998877",
            NotificationType.PAYMENT_REMINDER_1D,
            enrollment.id,
            DeliveryFixture.notification_date,
            enqueue,
            user_id=test_student.id,
            delivery_text="message",
        )
        is True
    )
    if source_change == "student_deleted":
        await db_session.execute(update(User).where(User.id == test_student.id).values(is_deleted=True))
    elif source_change == "enrollment_deleted":
        await db_session.execute(update(Enrollment).where(Enrollment.id == enrollment.id).values(is_deleted=True))
    elif source_change == "course_deleted":
        await db_session.execute(update(Course).where(Course.id == enrollment.course_id).values(is_deleted=True))
    elif source_change == "guardian_changed":
        await db_session.execute(update(User).where(User.id == test_student.id).values(parent_telegram_chat_id=112233))
    else:
        await db_session.execute(
            update(Enrollment).where(Enrollment.id == enrollment.id).values(student_id=test_mentor.id)
        )
    await db_session.commit()
    log: NotificationLog = await DeliveryFixture.load()
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, 998877, "message", log.id, log.revision or 1)
    failed: NotificationLog = await DeliveryFixture.load()
    assert failed.status == "failed"
    assert failed.is_terminal is True
    assert failed.error_message == "source_unavailable"
    sender.assert_not_awaited()
    assert await tasks.recover_notification_deliveries({}) == 0
