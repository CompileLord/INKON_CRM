from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.course import Course
from app.models.exam_result_notification import ExamResultNotification
from app.models.journal import Journal
from app.models.user import User
from app.repositories.sqlalchemy.exam_result_notification_repository import SQLAlchemyExamResultNotificationRepository
from app.services.exam_result_scheduling_service import ExamResultSchedulingService
from conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_many_edits_on_one_connection_keep_debouncing(test_student: User, test_mentor: User) -> None:
    edited_at: datetime = datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc)
    delay_seconds: int = 14400
    async with TestingSessionLocal() as session:
        course: Course = Course(
            title="Python Pro", description="d", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1),
            exam_type="monthly", price=Decimal("10.00"), mentor_id=test_mentor.id,
        )
        session.add(course)
        await session.flush()
        journal: Journal = Journal(
            course_id=course.id, period_label="Month 1", period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 28), period_type="month", exam_max_score=60,
        )
        session.add(journal)
        await session.flush()
        service: ExamResultSchedulingService = ExamResultSchedulingService(
            SQLAlchemyExamResultNotificationRepository(session), delay_seconds
        )
        for edit_index in range(8):
            await service.register_exam_score_edit(
                test_student.id, journal.id, edit_index, edit_index + 1, edited_at + timedelta(minutes=edit_index)
            )
        await session.commit()
    async with TestingSessionLocal() as session:
        rows: list[ExamResultNotification] = list((await session.scalars(select(ExamResultNotification))).all())
        assert len(rows) == 1
        assert rows[0].due_at == edited_at + timedelta(minutes=7, seconds=delay_seconds)
