import hashlib
import json
from typing import Any
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.credit_allocation_idempotency import CreditAllocationIdempotency
from app.models.user import User
from app.schemas.ledger import CourseCreditAllocationPayload, CourseCreditAllocationResponse
from app.schemas.payment import PaymentIdempotency
from app.services.finance_service import FinanceService


class CreditAllocationIdempotencyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db
        self.finance: FinanceService = FinanceService(db)

    async def allocate(self, student_id: int, payload: CourseCreditAllocationPayload, actor: User, key: str | None) -> tuple[dict[str, Any], bool]:
        if key is None:
            return await self.finance.allocate_course_credit(student_id, payload.enrollment_id, payload.amount, actor), False
        content: str = json.dumps({"student_id": student_id, "enrollment_id": payload.enrollment_id,
                                   "amount": format(payload.amount, '.2f') if payload.amount is not None else None}, sort_keys=True)
        fingerprint: str = hashlib.sha256(content.encode()).hexdigest()
        await self.finance.lock_student_accounts([student_id])
        original: CreditAllocationIdempotency | None = await self._find(actor.id, key)
        if original is not None:
            return self._replay(original, fingerprint), True
        try:
            async with self.db.begin_nested():
                result: dict[str, Any] = await self.finance.allocate_course_credit(student_id, payload.enrollment_id, payload.amount, actor)
                serialized: dict[str, Any] = CourseCreditAllocationResponse.model_validate(result).model_dump(mode="json")
                self.db.add(CreditAllocationIdempotency(recorder_id=actor.id, idempotency_key=key, fingerprint=fingerprint, result=serialized))
                await self.db.flush()
        except IntegrityError as error:
            if "uq_credit_allocation_recorder_key" not in str(error):
                raise
            original = await self._find(actor.id, key)
            if original is None:
                raise
            return self._replay(original, fingerprint), True
        return serialized, False

    async def _find(self, recorder_id: int, key: str) -> CreditAllocationIdempotency | None:
        return await self.db.scalar(select(CreditAllocationIdempotency).where(
            CreditAllocationIdempotency.recorder_id == recorder_id, CreditAllocationIdempotency.idempotency_key == key,
        ).execution_options(populate_existing=True))

    def _replay(self, original: CreditAllocationIdempotency, fingerprint: str) -> dict[str, Any]:
        if original.fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail={"code": PaymentIdempotency.MISMATCH_CODE})
        return original.result
