from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, computed_field
from app.models.payment import PaymentMethod


class PaymentCreate(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    course_id: int
    amount: Decimal = Field(gt=0)
    paid_at: datetime
    method: PaymentMethod
    discount_percent: int = Field(0, ge=0, le=100)
    comment: Optional[str] = None


class PaymentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    amount: Decimal
    paid_at: datetime
    method: PaymentMethod
    accepted_by_id: int
    discount_percent: int
    comment: Optional[str] = None
    created_at: datetime

    @computed_field
    @property
    def effective_amount(self) -> Decimal:
        return self.amount * (Decimal("1.0") - Decimal(self.discount_percent) / Decimal("100.0"))
