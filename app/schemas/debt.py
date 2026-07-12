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
    price_at_enrollment: Decimal
    total_paid: Decimal
    debt: Decimal
    overdue_days: int
