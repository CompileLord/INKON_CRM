from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel
from app.models.payment import PaymentMethod
from app.schemas.ledger import PaymentTargetResponse


class ReceiptAllocationItem(BaseModel):
    charge_id: int
    charge_type: str
    course_title: str
    due_date: str
    allocated_amount: Decimal


class PaymentReceiptResponse(BaseModel):
    receipt_number: str
    status: Literal["valid", "voided", "refunded", "partially_refunded"]
    refunded_amount: Decimal
    net_amount: Decimal
    occurred_at: datetime
    student_id: int
    student_name: str
    student_email: Optional[str] = None
    amount: Decimal
    method: Optional[PaymentMethod] = None
    accepted_by_name: str
    allocations: List[ReceiptAllocationItem] = []
    targets: List[PaymentTargetResponse] = []
    comment: Optional[str] = None
