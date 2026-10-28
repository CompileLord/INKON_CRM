from decimal import Decimal
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel
from app.schemas.enrollment import EffectiveBillingMode
from app.models.enrollment import EnrollmentStatus


class DebtStudentInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    payment_day_of_month: Optional[int] = None


class DebtCourseInfo(BaseModel):
    id: int
    title: str


class DebtResponse(BaseModel):
    student: DebtStudentInfo
    course: DebtCourseInfo
    price_at_enrollment: Decimal
    billing_mode: EffectiveBillingMode
    enrollment_status: EnrollmentStatus
    billed_to_date: Decimal
    total_paid: Decimal
    debt: Decimal
    overdue_days: int
    reminder_channel: Literal["telegram", "sms"] | None = None
    reminder_masked_destination: str | None = None
    parent_telegram_linked: bool
    last_reminder_at: Optional[datetime]
