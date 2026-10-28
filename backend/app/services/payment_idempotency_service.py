from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.payment import PaymentIdempotency, PaymentTargetInput
from app.services.finance_service import FinanceService
from app.services.payment_date_window import PaymentDateWindow


@dataclass(frozen=True)
class PaymentRecordResult:
    entry: LedgerEntry
    replayed: bool


class PaymentIdempotencyService:
    INDEX_NAME: str = "uq_ledger_recorder_idempotency_key"

    def __init__(self, db: AsyncSession, finance_service: FinanceService, date_window: PaymentDateWindow) -> None:
        self.date_window: PaymentDateWindow = date_window
        self.db: AsyncSession = db
        self.finance_service: FinanceService = finance_service

    async def record_payment(
        self,
        student_id: int,
        course_id: Optional[int],
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        comment: Optional[str],
        current_user: User,
        idempotency_key: Optional[str],
        targets: Optional[list[PaymentTargetInput]] = None,
    ) -> PaymentRecordResult:
        if (course_id is None) == (targets is None):
            raise HTTPException(status_code=422, detail={"code": "payment_target_required"})
        if targets is None:
            enrollment: Optional[Enrollment] = await self.db.scalar(select(Enrollment).where(
                Enrollment.student_id == student_id, Enrollment.course_id == course_id,
            ))
            if enrollment is None:
                raise HTTPException(status_code=422, detail={"code": "invalid_payment_target"})
            normalized_targets: list[PaymentTargetInput] = [PaymentTargetInput(enrollment_id=enrollment.id, amount=amount)]
        else:
            normalized_targets = targets
        await self.date_window.require_after_enrollment_starts(
            student_id, [target.enrollment_id for target in normalized_targets], paid_at,
        )
        if idempotency_key is None:
            recorded_entry: LedgerEntry = await self.finance_service.create_payment(
                student_id, course_id, amount, paid_at, method, comment, current_user, normalized_targets
            )
            return PaymentRecordResult(entry=recorded_entry, replayed=False)

        fingerprint: str = PaymentIdempotency.fingerprint(student_id, course_id, amount, paid_at, method, comment, normalized_targets)
        legacy_fingerprint: Optional[str] = PaymentIdempotency.fingerprint(student_id, course_id, amount, paid_at, method, comment) if targets is None else None
        await self.finance_service.lock_student_accounts([student_id])
        original: Optional[LedgerEntry] = await self._find_original(current_user.id, idempotency_key)
        if original is not None:
            return self._replay(original, fingerprint, legacy_fingerprint)

        try:
            async with self.db.begin_nested():
                entry: LedgerEntry = await self.finance_service.create_payment(
                    student_id, course_id, amount, paid_at, method, comment, current_user, normalized_targets
                )
                entry.idempotency_key = idempotency_key
                entry.idempotency_fingerprint = fingerprint
                await self.db.flush()
        except IntegrityError as error:
            if self.INDEX_NAME not in str(error):
                raise
            winner: Optional[LedgerEntry] = await self._find_original(current_user.id, idempotency_key)
            if winner is None:
                raise
            return self._replay(winner, fingerprint, legacy_fingerprint)
        return PaymentRecordResult(entry=entry, replayed=False)

    async def _find_original(self, recorder_id: int, idempotency_key: str) -> Optional[LedgerEntry]:
        original_result = await self.db.execute(
            select(LedgerEntry)
            .options(selectinload(LedgerEntry.allocations))
            .filter(
                LedgerEntry.recorded_by_id == recorder_id,
                LedgerEntry.idempotency_key == idempotency_key,
            )
            .execution_options(populate_existing=True)
        )
        return original_result.scalars().first()

    def _replay(self, original: LedgerEntry, fingerprint: str, legacy_fingerprint: Optional[str] = None) -> PaymentRecordResult:
        if original.idempotency_fingerprint != fingerprint and (legacy_fingerprint is None or original.idempotency_fingerprint != legacy_fingerprint):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": PaymentIdempotency.MISMATCH_CODE,
                    "message": "This Idempotency-Key was already used for a different payment",
                },
            )
        return PaymentRecordResult(entry=original, replayed=True)
