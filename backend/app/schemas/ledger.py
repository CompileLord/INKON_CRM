from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.ledger import LedgerEntryType
from app.models.payment import PaymentMethod


class AllocationResponse(BaseModel):
    id: int
    ledger_entry_id: int
    charge_id: int
    amount: Decimal
    reversed_by_entry_id: Optional[int] = None
    created_at: datetime


class LedgerEntryResponse(BaseModel):
    id: int
    student_id: int
    type: LedgerEntryType
    amount: Decimal
    method: Optional[PaymentMethod] = None
    occurred_at: datetime
    recorded_by_id: int
    reverses_entry_id: Optional[int] = None
    is_cash_out: Optional[bool] = None
    reason_code: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime
    allocations: List[AllocationResponse] = []


class VoidPaymentPayload(BaseModel):
    model_config = {"extra": "forbid"}
    reason_code: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = None


class RefundPaymentPayload(BaseModel):
    model_config = {"extra": "forbid"}
    amount: Decimal = Field(gt=0)
    # False -> cash leaves the centre. True -> value is retained as wallet credit.
    to_wallet: bool = False
    reason_code: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = None


class DiscountCreatePayload(BaseModel):
    """A concession that reduces the receivable. Never attached to a payment."""

    model_config = {"extra": "forbid"}
    student_id: int
    charge_id: Optional[int] = None
    amount: Decimal = Field(gt=0)
    occurred_at: Optional[datetime] = None
    reason_code: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = None


class AdjustmentCreatePayload(BaseModel):
    """Correcting credit posted in the open period (SuperAdmin only)."""

    model_config = {"extra": "forbid"}
    student_id: int
    amount: Decimal = Field(gt=0)
    occurred_at: Optional[datetime] = None
    reason_code: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = None


class AllocationCreatePayload(BaseModel):
    """Manually apply a student's wallet credit to a specific charge."""

    model_config = {"extra": "forbid"}
    student_id: int
    charge_id: int
    amount: Optional[Decimal] = Field(None, gt=0)


class StudentBalanceResponse(BaseModel):
    student_id: int
    billed_to_date: Decimal
    total_settled: Decimal
    net_receivable: Decimal
    credit_balance: Decimal
    days_overdue: int


class PaymentAllocationItem(BaseModel):
    charge_id: int
    course_id: int
    course_title: str
    due_date: date
    amount: Decimal


class PaymentEntryResponse(BaseModel):
    """A recorded payment. ``amount`` is always the cash actually received."""

    id: int
    student_id: int
    amount: Decimal
    paid_at: datetime
    method: Optional[PaymentMethod] = None
    recorded_by_id: int
    comment: Optional[str] = None
    created_at: datetime
    allocated_amount: Decimal = Decimal("0.00")
    unallocated_amount: Decimal = Decimal("0.00")
    is_voided: bool = False
    refunded_amount: Decimal = Decimal("0.00")
    allocations: List[PaymentAllocationItem] = []
