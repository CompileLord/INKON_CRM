from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import re
from typing import Any, ClassVar, Optional
from pydantic import AwareDatetime, BaseModel, Field, field_validator
from app.core.config import settings
from app.models.payment import PaymentMethod
from app.schemas.common import PositiveMoney


class PaymentCommentPolicy:
    MAX_LENGTH: ClassVar[int] = 500


class PaymentTargetInput(BaseModel):
    model_config = {"extra": "forbid"}
    enrollment_id: int
    amount: PositiveMoney

    @field_validator("amount", mode="before", json_schema_input_type=str)
    @classmethod
    def require_decimal_string(cls, value: Any) -> Any:
        if not isinstance(value, (str, Decimal)):
            raise ValueError("Target amount must be a decimal string")
        return value


class PaymentCreate(BaseModel):
    """Record cash received from a student.

    ``amount`` is the cash actually taken. Concessions are recorded separately
    via ``POST /finance/discounts/`` — a discount reduces what the student owes
    and must never be folded into a payment.
    """

    model_config = {"extra": "forbid"}
    student_id: int
    course_id: Optional[int] = None
    targets: Optional[list[PaymentTargetInput]] = Field(default=None, min_length=1)
    amount: PositiveMoney
    paid_at: AwareDatetime
    method: PaymentMethod
    comment: Optional[str] = Field(None, max_length=PaymentCommentPolicy.MAX_LENGTH)

    @field_validator("paid_at")
    @classmethod
    def reject_future_payment(cls, paid_at: AwareDatetime) -> AwareDatetime:
        latest_allowed: datetime = datetime.now(timezone.utc) + timedelta(minutes=settings.PAYMENT_FUTURE_TOLERANCE_MINUTES)
        if paid_at > latest_allowed:
            raise ValueError("Payment date cannot be in the future")
        return paid_at


class PaymentIdempotency:
    KEY_PATTERN: re.Pattern[str] = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
    MISMATCH_CODE: str = "idempotency_key_payload_mismatch"

    @staticmethod
    def fingerprint(
        student_id: int,
        course_id: Optional[int],
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        comment: Optional[str],
        targets: Optional[list[PaymentTargetInput]] = None,
    ) -> str:
        normalized_paid_at: datetime = paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=timezone.utc)
        canonical: str = json.dumps(
            [
                student_id,
                sorted((target.enrollment_id, format(target.amount, ".2f")) for target in targets) if targets is not None else course_id,
                format(Decimal(amount).quantize(Decimal("0.01")), "f"),
                normalized_paid_at.astimezone(timezone.utc).isoformat(),
                PaymentMethod(method).value,
                comment,
            ]
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
