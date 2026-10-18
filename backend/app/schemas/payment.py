from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.payment import PaymentMethod
from app.schemas.common import PositiveMoney


class PaymentCreate(BaseModel):
    """Record cash received from a student.

    ``amount`` is the cash actually taken. Concessions are recorded separately
    via ``POST /finance/discounts/`` — a discount reduces what the student owes
    and must never be folded into a payment.
    """

    model_config = {"extra": "forbid"}
    student_id: int
    course_id: int
    amount: PositiveMoney
    paid_at: datetime
    method: PaymentMethod
    comment: Optional[str] = None
