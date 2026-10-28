from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
from app.repositories.sqlalchemy.payment_reminder_repository import SQLAlchemyPaymentReminderRepository
from app.services.payment_reminder_service import PaymentReminderService


@pytest.mark.asyncio
async def test_reminder_amount_is_stored_and_projected(db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    test_student.parent_telegram_chat_id = 998877
    course: Course = Course(title="Geometry", description="", start_date=date(2026, 7, 1), end_date=date(2026, 7, 31), exam_type=CourseExamType.WEEKLY, price=Decimal("100.00"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal("100.00"), color_hex="#0000FF")
    db_session.add(enrollment)
    await db_session.flush()
    db_session.add(Charge(student=test_student, enrollment=enrollment, sequence_no=1, amount=Decimal("100.00"), due_date=date(2026, 7, 14)))
    await db_session.flush()
    enqueue: AsyncMock = AsyncMock()
    service: PaymentReminderService = PaymentReminderService(SQLAlchemyPaymentReminderRepository(db_session), enqueue)
    assert await service.run(date(2026, 7, 12)) == 1
    log: NotificationLog = (await db_session.execute(select(NotificationLog))).scalar_one()
    assert log.delivery_amount == Decimal("100.00")
    items: list[dict[str, Any]]
    total: int
    items, total = await SQLAlchemyNotificationLogRepository(db_session).delivery_page(1, 20, None)
    assert total == 1
    assert items[0]["amount"] == "100.00"
    log.delivery_amount = None
    await db_session.flush()
    items, total = await SQLAlchemyNotificationLogRepository(db_session).delivery_page(1, 20, None)
    assert items[0]["amount"] is None
