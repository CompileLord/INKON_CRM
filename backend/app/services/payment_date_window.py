from datetime import datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status

from app.core.config import settings
from app.repositories.interfaces.enrollment_repository import EnrollmentRepository, EnrollmentStartWindow


class PaymentDateWindow:
    def __init__(self, enrollment_repository: EnrollmentRepository) -> None:
        self.enrollment_repository: EnrollmentRepository = enrollment_repository

    async def require_after_enrollment_start(self, student_id: int, course_id: int, paid_at: datetime) -> None:
        start_window: Optional[EnrollmentStartWindow] = await self.enrollment_repository.find_start_window(student_id, course_id)
        if start_window is None:
            return
        course_start: datetime = datetime.combine(start_window.course_start_date, time.min, tzinfo=timezone.utc)
        enrollment_start: datetime = min(start_window.enrolled_at, course_start)
        earliest_allowed: datetime = enrollment_start - timedelta(days=settings.PAYMENT_BEFORE_ENROLLMENT_TOLERANCE_DAYS)
        if paid_at < earliest_allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Payment date cannot be more than {settings.PAYMENT_BEFORE_ENROLLMENT_TOLERANCE_DAYS} days before the enrollment start",
            )
