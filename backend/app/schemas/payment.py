from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import re
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


class PaymentIdempotency:
    KEY_PATTERN: re.Pattern[str] = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
    MISMATCH_CODE: str = "idempotency_key_payload_mismatch"

    @staticmethod
    def fingerprint(
        student_id: int,
        course_id: int,
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        comment: Optional[str],
    ) -> str:
        normalized_paid_at: datetime = paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=timezone.utc)
        canonical: str = json.dumps(
            [
                student_id,
                course_id,
                format(Decimal(amount).quantize(Decimal("0.01")), "f"),
                normalized_paid_at.astimezone(timezone.utc).isoformat(),
                PaymentMethod(method).value,
                comment,
            ]
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
