from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, List
from pydantic import BaseModel, Field, field_validator
from app.models.ledger import LedgerEntryType
from app.models.payment import PaymentMethod
from app.schemas.common import PositiveMoney
from app.schemas.money import MoneyAmount
from app.schemas.payment import PaymentCommentPolicy


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
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)


class RefundPaymentPayload(BaseModel):
    model_config = {"extra": "forbid"}
    amount: PositiveMoney
    # False -> cash leaves the centre. True -> value is retained as wallet credit.
    to_wallet: bool = False
    reason_code: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)


class DiscountCreatePayload(BaseModel):
    """A concession that reduces the receivable. Never attached to a payment."""

    model_config = {"extra": "forbid"}
    student_id: int
    charge_id: Optional[int] = None
    amount: PositiveMoney
    occurred_at: Optional[datetime] = None
    reason_code: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)


class AdjustmentCreatePayload(BaseModel):
    """Correcting credit posted in the open period (SuperAdmin only)."""

    model_config = {"extra": "forbid"}
    student_id: int
    amount: PositiveMoney
    occurred_at: Optional[datetime] = None
    reason_code: str = Field(..., min_length=1, max_length=50)
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)


class AllocationCreatePayload(BaseModel):
    """Manually apply a student's wallet credit to a specific charge."""

    model_config = {"extra": "forbid"}
    student_id: int
    charge_id: int
    amount: Optional[PositiveMoney] = None


class CourseCreditAllocationPayload(BaseModel):
    model_config = {"extra": "forbid"}
    enrollment_id: int = Field(gt=0)
    amount: Optional[PositiveMoney] = None

    @field_validator("amount", mode="before", json_schema_input_type=str | None)
    @classmethod
    def require_decimal_string(cls, value: Any) -> Any:
        if value is not None and not isinstance(value, str):
            raise ValueError("Amount must be a decimal string")
        return value


class CourseCreditAllocationItem(BaseModel):
    charge_id: int
    ledger_entry_id: int
    amount: MoneyAmount


class CourseCreditAllocationResponse(BaseModel):
    allocated_amount: MoneyAmount
    wallet_credit: MoneyAmount
    allocations: List[CourseCreditAllocationItem]


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


class PaymentTargetResponse(BaseModel):
    enrollment_id: int
    course_id: int
    course_title: str
    amount: Decimal


class PaymentOptionResponse(BaseModel):
    enrollment_id: int
    course_id: int
    course_title: str
    open_debt: Decimal
    overdue_days: int
    remaining_contract_maximum: Decimal
    billing_mode: str
    status: str


class PaymentOptionsResponse(BaseModel):
    wallet_credit: Decimal
    enrollments: List[PaymentOptionResponse]


class PaymentEntryResponse(BaseModel):
    """A recorded payment. ``amount`` is always the cash actually received."""

    id: int
    student_id: int
    student_first_name: Optional[str] = None
    student_last_name: Optional[str] = None
    amount: Decimal
    paid_at: datetime
    method: Optional[PaymentMethod] = None
    recorded_by_id: int
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)
    created_at: datetime
    allocated_amount: Decimal = Decimal("0.00")
    unallocated_amount: Decimal = Decimal("0.00")
    is_voided: bool = False
    refunded_amount: Decimal = Decimal("0.00")
    allocations: List[PaymentAllocationItem] = []
    targets: List[PaymentTargetResponse] = []
