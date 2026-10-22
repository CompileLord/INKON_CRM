from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.course import Course
from app.models.enrollment import Enrollment


class PaymentDateWindow:
    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db

    async def require_after_enrollment_start(self, student_id: int, course_id: int, paid_at: datetime) -> None:
        enrollment_result = await self.db.execute(
            select(Enrollment.enrolled_at, Course.start_date)
            .join(Course, Course.id == Enrollment.course_id)
            .where(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course_id,
                Enrollment.is_deleted == False,  # noqa: E712
            )
        )
        enrollment_row = enrollment_result.first()
        if enrollment_row is None:
            return
        enrolled_at: datetime = enrollment_row.enrolled_at
        course_start: date = enrollment_row.start_date
        enrollment_start: datetime = min(enrolled_at, datetime.combine(course_start, time.min, tzinfo=timezone.utc))
        earliest_allowed: datetime = enrollment_start - timedelta(days=settings.PAYMENT_BEFORE_ENROLLMENT_TOLERANCE_DAYS)
        if paid_at < earliest_allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Payment date cannot be more than {settings.PAYMENT_BEFORE_ENROLLMENT_TOLERANCE_DAYS} days before the enrollment start",
            )
