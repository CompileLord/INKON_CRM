from datetime import date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel
from app.models.charge import ChargeType, ChargeStatus


class ChargeResponse(BaseModel):
    id: int
    enrollment_id: int
    student_id: int
    sequence_no: int
    amount: Decimal
    due_date: date
    type: ChargeType
    status: ChargeStatus
    allocated_amount: Decimal = Decimal("0.00")
    remaining_balance: Decimal = Decimal("0.00")
    student_name: Optional[str] = None
    course_title: Optional[str] = None


class StudentCreditResponse(BaseModel):
    student_id: int
    student_name: str
    email: str
    credit_balance: Decimal
