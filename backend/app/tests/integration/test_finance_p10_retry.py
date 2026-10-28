from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.models.user import User
from app.tests.conftest import TestingSessionLocal
from app.workers.notification_retry import NotificationRetryWorker


async def headers(client: AsyncClient, user: User, password: str) -> dict[str, str]:
    response: Response = await client.post("/api/v1/auth/login", json={"email": user.email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
@pytest.mark.parametrize("telegram", [True, False])
async def test_retry_enqueues_once_and_resolves_current_channel(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User,
    monkeypatch: pytest.MonkeyPatch, telegram: bool,
) -> None:
    course: Course = Course(title="Geometry", description="", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1), exam_type=CourseExamType.MONTHLY, price=Decimal("100.00"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal("100.00"), color_hex="#000000")
    db_session.add(enrollment)
    await db_session.flush()
    db_session.add(Charge(student_id=test_student.id, enrollment_id=enrollment.id, sequence_no=1, amount=Decimal("100.00"), due_date=date(2026, 10, 2)))
    log: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.PAYMENT_REMINDER_1D, related_entity_id=enrollment.id, notification_date=date(2026, 10, 1), status=NotificationStatus.FAILED, delivery_state=NotificationStatus.FAILED, attempts=3, delivery_text="Payment reminder", delivery_amount=Decimal("100.00"))
    db_session.add(log)
    await db_session.commit()
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    authorization: dict[str, str] = await headers(client, test_admin, "admin_pass123")
    response: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=authorization)
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert response.json()["amount"] == "100.00"
    second: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=authorization)
    assert second.status_code == 409 and second.json()["detail"]["code"] == "notification_not_failed"
    assert enqueue.await_count == 1
    assert await db_session.scalar(select(AuditLog.id).where(AuditLog.entity_type == "notification", AuditLog.entity_id == log.id, AuditLog.user_id == test_admin.id)) is not None
    current_student: User | None = await db_session.get(User, test_student.id)
    assert current_student is not None
    current_student.parent_telegram_chat_id = 998877 if telegram else None
    await db_session.commit()
    send_telegram: AsyncMock = AsyncMock()
    send_sms: AsyncMock = AsyncMock()
    close_sms: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.workers.notification_retry.AsyncSessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.workers.notification_retry.bot.send_message", send_telegram)
    monkeypatch.setattr("app.workers.notification_retry.PayomchiSmsSender.send", send_sms)
    monkeypatch.setattr("app.workers.notification_retry.PayomchiSmsSender.aclose", close_sms)
    await NotificationRetryWorker().run(log.id, response.json().get("revision", 2))
    assert send_telegram.await_count == (1 if telegram else 0)
    assert send_sms.await_count == (0 if telegram else 1)
    await db_session.refresh(log)
    assert log.delivery_state == NotificationStatus.SENT
    await NotificationRetryWorker().run(log.id, 2)
    assert send_telegram.await_count == (1 if telegram else 0)
    assert send_sms.await_count == (0 if telegram else 1)
    after_send: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=authorization)
    assert after_send.status_code == 409


@pytest.mark.asyncio
async def test_retry_guards_and_rate_limit(client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch) -> None:
    log: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.EXAM_RESULT, related_entity_id=100, notification_date=date(2026, 10, 1), status=NotificationStatus.SENT)
    db_session.add(log)
    await db_session.commit()
    admin: dict[str, str] = await headers(client, test_admin, "admin_pass123")
    response: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=admin)
    assert response.status_code == 409 and response.json()["detail"]["code"] == "notification_not_failed"
    missing: Response = await client.post("/api/v1/notifications/logs/999999/retry", headers=admin)
    assert missing.status_code == 404
    for user, password in ((test_student, "student_pass123"), (test_mentor, "mentor_pass123")):
        denied: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=await headers(client, user, password))
        assert denied.status_code == 403
    monkeypatch.setattr("app.core.config.settings.SMS_PASSWORD_IP_LIMIT", 2)
    limited: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=admin)
    assert limited.status_code == 429


@pytest.mark.asyncio
async def test_retry_recovery_uses_retry_dispatch(db_session: AsyncSession, test_student: User) -> None:
    from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
    from app.services.notification_service import NotificationService

    log: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.PAYMENT_REMINDER_1D, related_entity_id=1234, notification_date=date(2026, 10, 1), status=NotificationStatus.QUEUED, delivery_state=NotificationStatus.QUEUED, retry_requested=True, revision=2, delivery_text="reminder")
    db_session.add(log)
    await db_session.commit()
    enqueue: AsyncMock = AsyncMock()
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    assert await service.recover_deliveries(enqueue) == 1
    assert enqueue.await_args.args[0] == "retry_notification_delivery"
    assert enqueue.await_args.args[1]["notification_id"] == log.id


@pytest.mark.asyncio
async def test_exam_retry_uses_current_channel(client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models.journal import Journal, JournalPeriodType
    from app.models.journal_student_summary import JournalStudentSummary

    course: Course = Course(title="Geometry", description="", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1), exam_type=CourseExamType.MONTHLY, price=Decimal("100.00"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.flush()
    journal: Journal = Journal(course_id=course.id, period_label="October", period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), period_type=JournalPeriodType.MONTH)
    db_session.add(journal)
    await db_session.flush()
    summary: JournalStudentSummary = JournalStudentSummary(journal_id=journal.id, student_id=test_student.id, sum_score=80, max_period_score=100)
    db_session.add(summary)
    await db_session.flush()
    log: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.EXAM_RESULT, related_entity_id=-summary.id, source_journal_id=journal.id, delivery_score=80, notification_date=date(2026, 10, 1), status=NotificationStatus.FAILED, delivery_state=NotificationStatus.FAILED)
    db_session.add(log)
    student: User | None = await db_session.get(User, test_student.id)
    assert student is not None
    student.parent_telegram_chat_id = 998877
    await db_session.commit()
    enqueue: AsyncMock = AsyncMock()
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    monkeypatch.setattr("app.workers.notification_retry.AsyncSessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.workers.notification_retry.bot.send_message", sender)
    authorization: dict[str, str] = await headers(client, test_admin, "admin_pass123")
    response: Response = await client.post(f"/api/v1/notifications/logs/{log.id}/retry", headers=authorization)
    assert response.status_code == 200
    await NotificationRetryWorker().run(log.id, 2)
    sender.assert_awaited_once()
    assert sender.await_args.args[0] == 998877
    assert "80/100" in sender.await_args.args[1]
