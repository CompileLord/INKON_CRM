from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.journal import Journal, JournalPeriodType
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.models.user import User
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository


@pytest.mark.asyncio
async def test_log_context_and_query_count(db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    course: Course = Course(title="Algebra", description="", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1), exam_type=CourseExamType.MONTHLY, price=Decimal("300.00"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal("300.00"), color_hex="#000000")
    journal: Journal = Journal(course_id=course.id, period_label="October", period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), period_type=JournalPeriodType.MONTH)
    db_session.add_all([enrollment, journal])
    await db_session.flush()
    reminder: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.PAYMENT_REMINDER_1D, related_entity_id=enrollment.id, notification_date=date(2026, 10, 1), status=NotificationStatus.FAILED, delivery_text="Reminder: Amount due: 300.00 TJS.")
    exam: NotificationLog = NotificationLog(user_id=test_student.id, recipient="123", type=NotificationType.EXAM_RESULT, related_entity_id=journal.id, notification_date=date(2026, 10, 1), status=NotificationStatus.FAILED, delivery_score=87)
    db_session.add_all([reminder, exam])
    await db_session.flush()
    count: list[int] = []
    connection: Any = await db_session.connection()
    def record(*args: Any, **kwargs: Any) -> None:
        count.append(1)
    event.listen(connection.sync_connection, "before_cursor_execute", record)
    repository: SQLAlchemyNotificationLogRepository = SQLAlchemyNotificationLogRepository(db_session)
    items: list[dict[str, Any]]
    total: int
    items, total = await repository.delivery_page(1, 100, None)
    event.remove(connection.sync_connection, "before_cursor_execute", record)
    assert total == 2
    assert len(count) == 2
    by_id: dict[int, dict[str, Any]] = {item["id"]: item for item in items}
    assert (by_id[reminder.id]["student_id"], by_id[reminder.id]["course_id"], by_id[reminder.id]["course_title"], by_id[reminder.id]["amount"], by_id[reminder.id]["score"]) == (test_student.id, course.id, "Algebra", "300.00", None)
    assert (by_id[exam.id]["student_id"], by_id[exam.id]["course_id"], by_id[exam.id]["course_title"], by_id[exam.id]["amount"], by_id[exam.id]["score"]) == (test_student.id, course.id, "Algebra", None, 87)


@pytest.mark.parametrize(
    ("notification_type", "message", "expected"),
    [
        (NotificationType.PAYMENT_REMINDER_1D, "К оплате: 42.50 TJS.", "42.50"),
        (NotificationType.PAYMENT_REMINDER_2D, "Amount due: 42.50 TJS.", "42.50"),
        (NotificationType.PAYMENT_REMINDER_2D, "Маблағи пардохт: 42.50 TJS.", "42.50"),
        (NotificationType.EXAM_RESULT, "Amount due: 42.50 TJS.", None),
    ],
)
def test_reminder_amount_from_message(notification_type: NotificationType, message: str, expected: str | None) -> None:
    log: NotificationLog = NotificationLog(type=notification_type, delivery_text=message)
    assert SQLAlchemyNotificationLogRepository._reminder_amount(log) == expected


def test_legacy_exam_score_marker() -> None:
    log: NotificationLog = NotificationLog(type=NotificationType.EXAM_RESULT, error_message="score:87")
    assert SQLAlchemyNotificationLogRepository._exam_score(log) == 87
    log.error_message = "score:87 unexpected error"
    assert SQLAlchemyNotificationLogRepository._exam_score(log) is None
