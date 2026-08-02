from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
from app.models.payment import PaymentMethod


class ReceiptAllocationItem(BaseModel):
    charge_id: int
    charge_type: str
    course_title: str
    due_date: str
    allocated_amount: Decimal


class PaymentReceiptResponse(BaseModel):
    receipt_number: str
    occurred_at: datetime
    student_id: int
    student_name: str
    student_email: str
    amount: Decimal
    method: Optional[PaymentMethod] = None
    accepted_by_name: str
    allocations: List[ReceiptAllocationItem] = []
    comment: Optional[str] = None
