from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class DebtStudentInfo(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    payment_day_of_month: Optional[int] = None


class DebtCourseInfo(BaseModel):
    id: int
    title: str


class DebtResponse(BaseModel):
    student: DebtStudentInfo
    course: DebtCourseInfo
    # Contracted total for the enrollment — not the amount currently owed.
    price_at_enrollment: Decimal
    # Charges that have come due so far.
    billed_to_date: Decimal
    total_paid: Decimal
    debt: Decimal
    overdue_days: int
