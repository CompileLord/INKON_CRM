"""Finance domain service — charge/credit ledger.

Model summary (see FINANCE_REDESIGN_PLAN.md):

* ``charges``        — dated obligations generated from an enrollment.
* ``ledger_entries`` — immutable typed credits/events. Never updated or deleted.
* ``allocations``    — which credit settled which charge. Never deleted; a
  reversal stamps ``reversed_by_entry_id``. Only rows where that column is
  NULL count toward balances.

Money semantics:

* ``payment.amount`` is **cash received**. Discounts never alter it; a discount
  is its own ledger entry that reduces the receivable (decision 3).
* A **cash-out** refund removes money from the centre and therefore reduces the
  student's credit. A **wallet** refund only un-applies a payment from its
  charges — credit is retained and is not auto-reapplied, so the accountant can
  direct it with an explicit allocation.
"""

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
import calendar
import json
from typing import Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy import Date, and_, case, cast, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.accounting_period import AccountingPeriod, AccountingPeriodStatus
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus, ChargeType
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User, UserRole
from app.schemas.accounting_period import ClosePeriodPayload, ReopenPeriodPayload
from app.schemas.ledger import (
    AdjustmentCreatePayload,
    AllocationCreatePayload,
    DiscountCreatePayload,
    RefundPaymentPayload,
    VoidPaymentPayload,
)
from app.core.redis import redis_client


# The centre operates on Asia/Dushanbe (UTC+5, no DST).
DUSHANBE_TZ_OFFSET = timedelta(hours=5)

ZERO = Decimal("0.00")

# Entry types that put credit on a student's account.
CREDIT_TYPES = (LedgerEntryType.PAYMENT, LedgerEntryType.ADJUSTMENT)


def get_dushanbe_today() -> date:
    return (datetime.now(timezone.utc) + DUSHANBE_TZ_OFFSET).date()


def _to_dushanbe(dt: datetime) -> datetime:
    """Render an instant in Dushanbe local wall-clock terms."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc) + DUSHANBE_TZ_OFFSET


def _q(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class FinanceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Infrastructure helpers
    # ------------------------------------------------------------------

    async def _check_period_open(self, occurred_at: datetime, what: str = "entry") -> None:
        """Reject writes dated into a closed accounting period."""
        local_dt = _to_dushanbe(occurred_at)
        query = select(AccountingPeriod).filter(
            AccountingPeriod.year == local_dt.year,
            AccountingPeriod.month == local_dt.month,
        )
        res = await self.db.execute(query)
        period = res.scalars().first()
        if period is not None and period.status == AccountingPeriodStatus.CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Accounting period {local_dt.year}-{local_dt.month:02d} is closed; "
                    f"cannot record {what}. Post an adjustment in the open period instead."
                ),
            )

    async def _log_audit(
        self,
        user_id: int,
        action: str,
        entity_type: str,
        entity_id: int,
        changes: dict,
    ) -> None:
        """Universal audit log helper — called by every finance mutation."""
        from app.services.audit_service import AuditService

        audit_service = AuditService(self.db)
        formatted = {k: (v if isinstance(v, tuple) else (None, v)) for k, v in changes.items()}
        await audit_service.log(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            changes=formatted,
        )

    async def _invalidate_cache(self) -> None:
        """Drop cached analytics. Uses SCAN — KEYS blocks the Redis event loop."""
        try:
            cursor = 0
            while True:
                cursor, keys = await redis_client.scan(cursor=cursor, match="finance:analytics:*", count=100)
                if keys:
                    await redis_client.delete(*keys)
                if cursor == 0:
                    break
        except Exception:
            # Cache invalidation must never fail a financial write.
            pass

    # ------------------------------------------------------------------
    # Ledger primitives
    # ------------------------------------------------------------------

    def _voided_ids_subquery(self):
        return select(LedgerEntry.reverses_entry_id).filter(
            LedgerEntry.type == LedgerEntryType.VOID,
            LedgerEntry.reverses_entry_id.isnot(None),
        )

    async def _active_allocated(self, entry_ids: Sequence[int]) -> Decimal:
        if not entry_ids:
            return ZERO
        q = select(func.coalesce(func.sum(Allocation.amount), ZERO)).filter(
            Allocation.ledger_entry_id.in_(entry_ids),
            Allocation.reversed_by_entry_id.is_(None),
        )
        res = await self.db.execute(q)
        return Decimal(res.scalar() or 0)

    async def _cash_out_refunded(self, entry_id: int) -> Decimal:
        q = select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
            LedgerEntry.reverses_entry_id == entry_id,
            LedgerEntry.type == LedgerEntryType.REFUND,
            LedgerEntry.is_cash_out.is_(True),
        )
        res = await self.db.execute(q)
        return Decimal(res.scalar() or 0)

    async def _entry_available(self, entry: LedgerEntry) -> Decimal:
        """Credit on this entry not yet applied and not cashed out."""
        allocated = await self._active_allocated([entry.id])
        cashed_out = await self._cash_out_refunded(entry.id)
        return entry.amount - allocated - cashed_out

    async def _charge_remaining(self, charge: Charge) -> Decimal:
        q = select(func.coalesce(func.sum(Allocation.amount), ZERO)).filter(
            Allocation.charge_id == charge.id,
            Allocation.reversed_by_entry_id.is_(None),
        )
        res = await self.db.execute(q)
        return charge.amount - Decimal(res.scalar() or 0)

    async def _recompute_charge_status(self, charge_ids: Sequence[int]) -> None:
        """Single source of truth for charge status.

        Every path that changes allocations funnels through here, so a partial
        credit can never mark a charge settled.
        """
        ids = [cid for cid in set(charge_ids) if cid]
        if not ids:
            return

        alloc_q = (
            select(Allocation.charge_id, func.coalesce(func.sum(Allocation.amount), ZERO))
            .filter(
                Allocation.charge_id.in_(ids),
                Allocation.reversed_by_entry_id.is_(None),
            )
            .group_by(Allocation.charge_id)
        )
        alloc_res = await self.db.execute(alloc_q)
        allocated_by_charge = {row[0]: Decimal(row[1] or 0) for row in alloc_res.all()}

        charges_res = await self.db.execute(select(Charge).filter(Charge.id.in_(ids)))
        for charge in charges_res.scalars().all():
            if charge.status == ChargeStatus.CANCELLED:
                continue
            allocated = allocated_by_charge.get(charge.id, ZERO)
            charge.status = ChargeStatus.SETTLED if allocated >= charge.amount else ChargeStatus.OPEN

        await self.db.flush()

    async def _reverse_allocations(
        self,
        source_entry_id: int,
        amount_to_reverse: Decimal,
        reversing_entry: LedgerEntry,
    ) -> List[int]:
        """Un-apply up to ``amount_to_reverse`` from a source entry's allocations.

        Nothing is deleted. A row that is only partially reversed is stamped as
        reversed in full and a fresh allocation is written for the surviving
        remainder, so the audit trail stays append-only.
        """
        remaining = amount_to_reverse
        affected: List[int] = []
        if remaining <= ZERO:
            return affected

        allocs_res = await self.db.execute(
            select(Allocation)
            .filter(
                Allocation.ledger_entry_id == source_entry_id,
                Allocation.reversed_by_entry_id.is_(None),
            )
            .order_by(Allocation.id.desc())
        )
        for alloc in allocs_res.scalars().all():
            if remaining <= ZERO:
                break
            affected.append(alloc.charge_id)
            alloc.reversed_by_entry_id = reversing_entry.id

            if alloc.amount > remaining:
                # Partial reversal: keep the untouched part as a new allocation.
                survivor = Allocation(
                    ledger_entry_id=source_entry_id,
                    charge_id=alloc.charge_id,
                    amount=alloc.amount - remaining,
                )
                self.db.add(survivor)
                remaining = ZERO
            else:
                remaining -= alloc.amount

        await self.db.flush()
        return affected

    async def _open_charges(self, student_id: int, enrollment_id: Optional[int] = None) -> List[Charge]:
        q = (
            select(Charge)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(
                Charge.student_id == student_id,
                Charge.status == ChargeStatus.OPEN,
                Charge.is_deleted == False,  # noqa: E712
                Enrollment.is_deleted == False,  # noqa: E712
            )
            .order_by(Charge.due_date.asc(), Charge.sequence_no.asc(), Charge.id.asc())
        )
        if enrollment_id is not None:
            q = q.filter(Charge.enrollment_id == enrollment_id)
        res = await self.db.execute(q)
        return list(res.scalars().all())

    async def _apply_credit(
        self,
        entries: List[LedgerEntry],
        charges: List[Charge],
    ) -> List[int]:
        """Apply available credit from ``entries`` to ``charges``, oldest first."""
        if not entries or not charges:
            return []

        charge_ids = [c.id for c in charges]
        alloc_q = (
            select(Allocation.charge_id, func.coalesce(func.sum(Allocation.amount), ZERO))
            .filter(
                Allocation.charge_id.in_(charge_ids),
                Allocation.reversed_by_entry_id.is_(None),
            )
            .group_by(Allocation.charge_id)
        )
        alloc_res = await self.db.execute(alloc_q)
        settled_by_charge: Dict[int, Decimal] = {row[0]: Decimal(row[1] or 0) for row in alloc_res.all()}

        touched: List[int] = []
        for entry in entries:
            available = await self._entry_available(entry)
            if available <= ZERO:
                continue

            for charge in charges:
                if available <= ZERO:
                    break
                needed = charge.amount - settled_by_charge.get(charge.id, ZERO)
                if needed <= ZERO:
                    continue

                amount = min(available, needed)
                self.db.add(
                    Allocation(
                        ledger_entry_id=entry.id,
                        charge_id=charge.id,
                        amount=amount,
                    )
                )
                settled_by_charge[charge.id] = settled_by_charge.get(charge.id, ZERO) + amount
                available -= amount
                touched.append(charge.id)

        await self.db.flush()
        await self._recompute_charge_status(touched)
        return touched

    async def auto_allocate_student_credit(
        self,
        student_id: int,
        prefer_enrollment_id: Optional[int] = None,
    ) -> None:
        """Apply a student's unapplied credit to their open charges.

        Charges belonging to ``prefer_enrollment_id`` are settled first so a
        payment recorded against a course lands on that course, with any
        surplus spilling to the student's other open charges rather than
        sitting idle.
        """
        voided = self._voided_ids_subquery()
        entries_res = await self.db.execute(
            select(LedgerEntry)
            .filter(
                LedgerEntry.student_id == student_id,
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
            )
            .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
        )
        entries = list(entries_res.scalars().all())
        if not entries:
            return

        if prefer_enrollment_id is not None:
            preferred = await self._open_charges(student_id, prefer_enrollment_id)
            if preferred:
                await self._apply_credit(entries, preferred)

        remaining_charges = await self._open_charges(student_id)
        if remaining_charges:
            await self._apply_credit(entries, remaining_charges)

    async def get_unallocated_credit(self, student_id: int) -> Decimal:
        """Wallet balance = credit received, less what it has settled.

        Cash-out refunds reduce it (money left the building); wallet refunds do
        not (the money is still the student's, merely un-applied).
        """
        voided = self._voided_ids_subquery()

        credit_res = await self.db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
                LedgerEntry.student_id == student_id,
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
            )
        )
        credit_total = Decimal(credit_res.scalar() or 0)

        cash_out_res = await self.db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
                LedgerEntry.student_id == student_id,
                LedgerEntry.type == LedgerEntryType.REFUND,
                LedgerEntry.is_cash_out.is_(True),
            )
        )
        cash_out = Decimal(cash_out_res.scalar() or 0)

        allocated_res = await self.db.execute(
            select(func.coalesce(func.sum(Allocation.amount), ZERO))
            .join(LedgerEntry, LedgerEntry.id == Allocation.ledger_entry_id)
            .filter(
                LedgerEntry.student_id == student_id,
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
                Allocation.reversed_by_entry_id.is_(None),
            )
        )
        allocated = Decimal(allocated_res.scalar() or 0)

        return max(ZERO, credit_total - cash_out - allocated)

    # ------------------------------------------------------------------
    # Schedule generation
    # ------------------------------------------------------------------

    async def generate_schedule_for_enrollment(self, enrollment_id: int) -> List[Charge]:
        """Generate the monthly installment schedule for an enrollment.

        Installments are equal to the cent, with the rounding remainder carried
        by the final installment so the schedule sums exactly to the contracted
        price. Idempotent: returns existing charges if already generated.
        """
        res = await self.db.execute(
            select(Enrollment, User, Course)
            .join(User, User.id == Enrollment.student_id)
            .join(Course, Course.id == Enrollment.course_id)
            .filter(Enrollment.id == enrollment_id)
        )
        row = res.first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
        enrollment, student, course = row

        existing_res = await self.db.execute(
            select(Charge).filter(
                Charge.enrollment_id == enrollment.id,
                Charge.is_deleted == False,  # noqa: E712
            )
        )
        existing = list(existing_res.scalars().all())
        if existing:
            return existing

        enrolled = enrollment.enrolled_at or datetime.now(timezone.utc)
        enrolled_date = enrolled.date() if isinstance(enrolled, datetime) else enrolled
        start_date = max(enrolled_date, course.start_date)
        end_date = course.end_date

        total_months = (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month) + 1
        total_months = max(1, total_months)

        price = Decimal(enrollment.price_at_enrollment)
        base = (price / Decimal(total_months)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        payment_day = student.payment_day_of_month or min(28, course.start_date.day)

        charges: List[Charge] = []
        accumulated = ZERO
        year, month = start_date.year, start_date.month

        for index in range(total_months):
            sequence_no = index + 1
            if sequence_no == total_months:
                amount = price - accumulated
            else:
                amount = base
                accumulated += amount

            _, max_days = calendar.monthrange(year, month)
            due_date = date(year, month, min(payment_day, max_days))
            if sequence_no == 1:
                # A student joining after their payment day owes the first
                # installment on joining, never retroactively.
                due_date = max(due_date, start_date)

            charge = Charge(
                enrollment_id=enrollment.id,
                student_id=student.id,
                sequence_no=sequence_no,
                amount=amount,
                due_date=due_date,
                type=ChargeType.TUITION,
                status=ChargeStatus.OPEN,
            )
            self.db.add(charge)
            charges.append(charge)

            month += 1
            if month > 12:
                month = 1
                year += 1

        await self.db.flush()
        await self.auto_allocate_student_credit(student.id, prefer_enrollment_id=enrollment.id)
        return charges

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    async def create_payment(
        self,
        student_id: int,
        course_id: int,
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        comment: Optional[str],
        current_user: User,
    ) -> LedgerEntry:
        """Record cash received. ``amount`` is always the cash actually taken."""
        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount must be greater than 0",
            )

        await self._check_period_open(paid_at, "payment")

        enrollment_res = await self.db.execute(
            select(Enrollment).filter(
                Enrollment.student_id == student_id,
                Enrollment.course_id == course_id,
                Enrollment.is_deleted == False,  # noqa: E712
            )
        )
        enrollment = enrollment_res.scalars().first()
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is not enrolled in this course",
            )

        entry = LedgerEntry(
            student_id=student_id,
            type=LedgerEntryType.PAYMENT,
            amount=amount,
            method=method,
            occurred_at=paid_at,
            recorded_by_id=current_user.id,
            comment=comment,
        )
        self.db.add(entry)
        await self.db.flush()

        await self.auto_allocate_student_credit(student_id, prefer_enrollment_id=enrollment.id)

        await self._log_audit(
            user_id=current_user.id,
            action="create",
            entity_type="payment",
            entity_id=entry.id,
            changes={
                "amount": str(amount),
                "student_id": student_id,
                "course_id": course_id,
                "method": str(method),
            },
        )
        await self._invalidate_cache()
        return await self._load_entry(entry.id)

    async def create_discount(self, payload: DiscountCreatePayload, current_user: User) -> LedgerEntry:
        """Record a concession that reduces the receivable without any cash."""
        occurred_at = payload.occurred_at or datetime.now(timezone.utc)
        await self._check_period_open(occurred_at, "discount")

        entry = LedgerEntry(
            student_id=payload.student_id,
            type=LedgerEntryType.DISCOUNT,
            amount=payload.amount,
            occurred_at=occurred_at,
            recorded_by_id=current_user.id,
            reason_code=payload.reason_code,
            comment=payload.comment,
        )
        self.db.add(entry)
        await self.db.flush()

        if payload.charge_id:
            charge_res = await self.db.execute(
                select(Charge).filter(
                    Charge.id == payload.charge_id,
                    Charge.student_id == payload.student_id,
                    Charge.is_deleted == False,  # noqa: E712
                )
            )
            charge = charge_res.scalars().first()
            if not charge:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target charge not found for student",
                )
            remaining = await self._charge_remaining(charge)
            if payload.amount > remaining:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Discount {payload.amount} exceeds the charge's remaining balance {remaining}",
                )
            targets = [charge]
        else:
            targets = await self._open_charges(payload.student_id)

        await self._apply_credit([entry], targets)

        applied = await self._active_allocated([entry.id])
        if applied < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Discount {payload.amount} exceeds the student's outstanding charges "
                    f"({applied} could be applied). Reduce the amount."
                ),
            )

        await self._log_audit(
            user_id=current_user.id,
            action="create",
            entity_type="discount",
            entity_id=entry.id,
            changes={"amount": str(payload.amount), "student_id": payload.student_id},
        )
        await self._invalidate_cache()
        return await self._load_entry(entry.id)

    async def create_adjustment(self, payload: AdjustmentCreatePayload, current_user: User) -> LedgerEntry:
        """Post a correcting credit in the open period.

        This is the sanctioned route for fixing something that happened inside
        a closed period, which cannot be voided in place.
        """
        if current_user.role != UserRole.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SuperAdmin can post adjustments",
            )

        occurred_at = payload.occurred_at or datetime.now(timezone.utc)
        await self._check_period_open(occurred_at, "adjustment")

        entry = LedgerEntry(
            student_id=payload.student_id,
            type=LedgerEntryType.ADJUSTMENT,
            amount=payload.amount,
            occurred_at=occurred_at,
            recorded_by_id=current_user.id,
            reason_code=payload.reason_code,
            comment=payload.comment,
        )
        self.db.add(entry)
        await self.db.flush()

        await self.auto_allocate_student_credit(payload.student_id)

        await self._log_audit(
            user_id=current_user.id,
            action="create",
            entity_type="adjustment",
            entity_id=entry.id,
            changes={"amount": str(payload.amount), "reason_code": payload.reason_code},
        )
        await self._invalidate_cache()
        return await self._load_entry(entry.id)

    async def void_payment(
        self,
        payment_id: int,
        payload: VoidPaymentPayload,
        current_user: User,
    ) -> LedgerEntry:
        """Reverse a payment in full, reopening whatever it had settled."""
        target = await self._get_payment_entry(payment_id)

        void_check = await self.db.execute(
            select(LedgerEntry).filter(
                LedgerEntry.reverses_entry_id == target.id,
                LedgerEntry.type == LedgerEntryType.VOID,
            )
        )
        if void_check.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment has already been voided",
            )

        refund_check = await self.db.execute(
            select(LedgerEntry).filter(
                LedgerEntry.reverses_entry_id == target.id,
                LedgerEntry.type == LedgerEntryType.REFUND,
            )
        )
        if refund_check.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment has been refunded and can no longer be voided",
            )

        # Both the original period and the current one must be open: voiding
        # mutates allocations, which would silently restate a closed month.
        await self._check_period_open(target.occurred_at, "a void of an entry in that period")
        now = datetime.now(timezone.utc)
        await self._check_period_open(now, "void")

        void_entry = LedgerEntry(
            student_id=target.student_id,
            type=LedgerEntryType.VOID,
            amount=target.amount,
            method=target.method,
            occurred_at=now,
            recorded_by_id=current_user.id,
            reverses_entry_id=target.id,
            reason_code=payload.reason_code,
            comment=payload.comment,
        )
        self.db.add(void_entry)
        await self.db.flush()

        affected = await self._reverse_allocations(target.id, target.amount, void_entry)
        await self._recompute_charge_status(affected)
        # Deliberately no re-allocation: a reversal must not silently reshuffle
        # the student's other credit. Allocation happens when money arrives or
        # a charge is raised; anything else is an explicit accountant action.

        await self._log_audit(
            user_id=current_user.id,
            action="void",
            entity_type="payment",
            entity_id=target.id,
            changes={"reason_code": payload.reason_code, "void_entry_id": void_entry.id},
        )
        await self._invalidate_cache()
        return await self._load_entry(void_entry.id)

    async def refund_payment(
        self,
        payment_id: int,
        payload: RefundPaymentPayload,
        current_user: User,
    ) -> LedgerEntry:
        """Refund part or all of a payment (SuperAdmin only)."""
        if current_user.role != UserRole.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SuperAdmin can issue refunds",
            )

        target = await self._get_payment_entry(payment_id)

        await self._check_period_open(target.occurred_at, "a refund of an entry in that period")
        now = datetime.now(timezone.utc)
        await self._check_period_open(now, "refund")

        refunded_res = await self.db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
                LedgerEntry.reverses_entry_id == target.id,
                LedgerEntry.type == LedgerEntryType.REFUND,
            )
        )
        already_refunded = Decimal(refunded_res.scalar() or 0)
        max_refundable = target.amount - already_refunded
        if payload.amount > max_refundable:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Refund amount {payload.amount} exceeds max refundable {max_refundable}",
            )

        cash_out = not payload.to_wallet
        refund_entry = LedgerEntry(
            student_id=target.student_id,
            type=LedgerEntryType.REFUND,
            amount=payload.amount,
            method=target.method if cash_out else None,
            is_cash_out=cash_out,
            occurred_at=now,
            recorded_by_id=current_user.id,
            reverses_entry_id=target.id,
            reason_code=payload.reason_code,
            comment=payload.comment,
        )
        self.db.add(refund_entry)
        await self.db.flush()

        # Free up the refunded value: for a cash-out the money is gone, for a
        # wallet refund it returns to the student's unapplied credit.
        affected = await self._reverse_allocations(target.id, payload.amount, refund_entry)
        await self._recompute_charge_status(affected)
        # As with a void, no automatic re-allocation — see void_payment.

        await self._log_audit(
            user_id=current_user.id,
            action="refund",
            entity_type="payment",
            entity_id=target.id,
            changes={
                "amount": str(payload.amount),
                "reason_code": payload.reason_code,
                "destination": "cash" if cash_out else "wallet",
            },
        )
        await self._invalidate_cache()
        return await self._load_entry(refund_entry.id)

    async def allocate_credit(self, payload: AllocationCreatePayload, current_user: User) -> LedgerEntry:
        """Manually apply wallet credit to a specific charge."""
        charge_res = await self.db.execute(
            select(Charge).filter(
                Charge.id == payload.charge_id,
                Charge.student_id == payload.student_id,
                Charge.is_deleted == False,  # noqa: E712
            )
        )
        charge = charge_res.scalars().first()
        if not charge:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charge not found for student")
        if charge.status == ChargeStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Charge is cancelled")

        remaining = await self._charge_remaining(charge)
        if remaining <= ZERO:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Charge is already settled")

        wallet = await self.get_unallocated_credit(payload.student_id)
        amount = payload.amount or min(wallet, remaining)
        if amount <= ZERO:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No credit available to allocate")
        if amount > wallet:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Amount {amount} exceeds available credit {wallet}",
            )
        if amount > remaining:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Amount {amount} exceeds the charge's remaining balance {remaining}",
            )

        voided = self._voided_ids_subquery()
        entries_res = await self.db.execute(
            select(LedgerEntry)
            .filter(
                LedgerEntry.student_id == payload.student_id,
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
            )
            .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
        )
        entries = list(entries_res.scalars().all())

        outstanding = amount
        last_entry_id = None
        for entry in entries:
            if outstanding <= ZERO:
                break
            available = await self._entry_available(entry)
            if available <= ZERO:
                continue
            portion = min(available, outstanding)
            self.db.add(
                Allocation(ledger_entry_id=entry.id, charge_id=charge.id, amount=portion)
            )
            outstanding -= portion
            last_entry_id = entry.id

        await self.db.flush()
        await self._recompute_charge_status([charge.id])

        await self._log_audit(
            user_id=current_user.id,
            action="update",
            entity_type="allocation",
            entity_id=charge.id,
            changes={"allocated": str(amount), "student_id": payload.student_id},
        )
        await self._invalidate_cache()
        return await self._load_entry(last_entry_id) if last_entry_id else None

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def _get_payment_entry(self, payment_id: int) -> LedgerEntry:
        res = await self.db.execute(
            select(LedgerEntry).filter(
                LedgerEntry.id == payment_id,
                LedgerEntry.type == LedgerEntryType.PAYMENT,
            )
        )
        entry = res.scalars().first()
        if not entry:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment entry not found")
        return entry

    async def _load_entry(self, entry_id: int) -> LedgerEntry:
        res = await self.db.execute(
            select(LedgerEntry)
            .options(selectinload(LedgerEntry.allocations))
            .filter(LedgerEntry.id == entry_id)
        )
        return res.scalars().first()

    async def _decorate_entries(self, entries: List[LedgerEntry]) -> List[dict]:
        """Attach allocation/course/void/refund context to payment entries."""
        if not entries:
            return []

        entry_ids = [e.id for e in entries]

        alloc_res = await self.db.execute(
            select(Allocation, Charge, Course)
            .join(Charge, Charge.id == Allocation.charge_id)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .join(Course, Course.id == Enrollment.course_id)
            .filter(
                Allocation.ledger_entry_id.in_(entry_ids),
                Allocation.reversed_by_entry_id.is_(None),
            )
        )
        allocations_by_entry: Dict[int, List[dict]] = {}
        allocated_by_entry: Dict[int, Decimal] = {}
        for alloc, charge, course in alloc_res.all():
            allocations_by_entry.setdefault(alloc.ledger_entry_id, []).append(
                {
                    "charge_id": charge.id,
                    "course_id": course.id,
                    "course_title": course.title,
                    "due_date": charge.due_date,
                    "amount": alloc.amount,
                }
            )
            allocated_by_entry[alloc.ledger_entry_id] = (
                allocated_by_entry.get(alloc.ledger_entry_id, ZERO) + alloc.amount
            )

        reversal_res = await self.db.execute(
            select(LedgerEntry).filter(
                LedgerEntry.reverses_entry_id.in_(entry_ids),
                LedgerEntry.type.in_([LedgerEntryType.VOID, LedgerEntryType.REFUND]),
            )
        )
        voided_ids = set()
        refunded_by_entry: Dict[int, Decimal] = {}
        for reversal in reversal_res.scalars().all():
            if reversal.type == LedgerEntryType.VOID:
                voided_ids.add(reversal.reverses_entry_id)
            else:
                refunded_by_entry[reversal.reverses_entry_id] = (
                    refunded_by_entry.get(reversal.reverses_entry_id, ZERO) + reversal.amount
                )

        items = []
        for entry in entries:
            allocated = allocated_by_entry.get(entry.id, ZERO)
            items.append(
                {
                    "id": entry.id,
                    "student_id": entry.student_id,
                    "amount": entry.amount,
                    "paid_at": entry.occurred_at,
                    "method": entry.method,
                    "recorded_by_id": entry.recorded_by_id,
                    "comment": entry.comment,
                    "created_at": entry.created_at,
                    "allocated_amount": allocated,
                    "unallocated_amount": max(ZERO, entry.amount - allocated),
                    "is_voided": entry.id in voided_ids,
                    "refunded_amount": refunded_by_entry.get(entry.id, ZERO),
                    "allocations": allocations_by_entry.get(entry.id, []),
                }
            )
        return items

    async def list_payments(self, filters: dict, page: int, page_size: int) -> dict:
        """List payment entries. Every filter applied here is real."""
        query = select(LedgerEntry).filter(LedgerEntry.type == LedgerEntryType.PAYMENT)

        if filters.get("student_id"):
            query = query.filter(LedgerEntry.student_id == filters["student_id"])
        if filters.get("date_from"):
            query = query.filter(LedgerEntry.occurred_at >= filters["date_from"])
        if filters.get("date_to"):
            query = query.filter(LedgerEntry.occurred_at <= filters["date_to"])
        if filters.get("method"):
            query = query.filter(LedgerEntry.method == filters["method"])
        if filters.get("recorded_by"):
            query = query.filter(LedgerEntry.recorded_by_id == filters["recorded_by"])
        if filters.get("course_id"):
            # A payment belongs to a course through what it actually settled.
            course_entries = (
                select(Allocation.ledger_entry_id)
                .join(Charge, Charge.id == Allocation.charge_id)
                .join(Enrollment, Enrollment.id == Charge.enrollment_id)
                .filter(
                    Enrollment.course_id == filters["course_id"],
                    Allocation.reversed_by_entry_id.is_(None),
                )
            )
            query = query.filter(LedgerEntry.id.in_(course_entries))

        query = query.order_by(LedgerEntry.occurred_at.desc(), LedgerEntry.id.desc())

        count_res = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_res.scalar() or 0

        page_size = min(max(1, page_size), 100)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        offset = (page - 1) * page_size

        res = await self.db.execute(query.offset(offset).limit(page_size))
        entries = list(res.scalars().all())

        return {
            "items": await self._decorate_entries(entries),
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def get_student_ledger(self, student_id: int) -> List[dict]:
        entries_res = await self.db.execute(
            select(LedgerEntry)
            .filter(LedgerEntry.student_id == student_id)
            .order_by(LedgerEntry.occurred_at.asc(), LedgerEntry.id.asc())
        )
        entries = list(entries_res.scalars().all())

        charges_res = await self.db.execute(
            select(Charge)
            .filter(Charge.student_id == student_id, Charge.is_deleted == False)  # noqa: E712
            .order_by(Charge.due_date.asc())
        )
        charges = list(charges_res.scalars().all())

        result: List[dict] = []
        for charge in charges:
            remaining = await self._charge_remaining(charge)
            result.append(
                {
                    "kind": "charge",
                    "id": charge.id,
                    "type": charge.type,
                    "amount": charge.amount,
                    "due_date": charge.due_date,
                    "status": charge.status,
                    "sequence_no": charge.sequence_no,
                    "remaining_balance": max(ZERO, remaining),
                }
            )

        for entry in entries:
            result.append(
                {
                    "kind": "entry",
                    "id": entry.id,
                    "type": entry.type,
                    "amount": entry.amount,
                    "method": entry.method,
                    "occurred_at": entry.occurred_at,
                    "reason_code": entry.reason_code,
                    "comment": entry.comment,
                    "reverses_entry_id": entry.reverses_entry_id,
                    "is_cash_out": entry.is_cash_out,
                }
            )

        return result

    async def get_student_balance(self, student_id: int) -> dict:
        today = get_dushanbe_today()

        billed_res = await self.db.execute(
            select(func.coalesce(func.sum(Charge.amount), ZERO)).filter(
                Charge.student_id == student_id,
                Charge.due_date <= today,
                Charge.status != ChargeStatus.CANCELLED,
                Charge.is_deleted == False,  # noqa: E712
            )
        )
        billed_to_date = Decimal(billed_res.scalar() or 0)

        settled_res = await self.db.execute(
            select(func.coalesce(func.sum(Allocation.amount), ZERO))
            .join(Charge, Charge.id == Allocation.charge_id)
            .filter(
                Charge.student_id == student_id,
                Charge.due_date <= today,
                Charge.status != ChargeStatus.CANCELLED,
                Charge.is_deleted == False,  # noqa: E712
                Allocation.reversed_by_entry_id.is_(None),
            )
        )
        total_settled = Decimal(settled_res.scalar() or 0)

        net_receivable = max(ZERO, billed_to_date - total_settled)
        credit_balance = await self.get_unallocated_credit(student_id)

        oldest_res = await self.db.execute(
            select(func.min(Charge.due_date)).filter(
                Charge.student_id == student_id,
                Charge.due_date <= today,
                Charge.status == ChargeStatus.OPEN,
                Charge.is_deleted == False,  # noqa: E712
            )
        )
        oldest_due = oldest_res.scalar()

        days_overdue = (today - oldest_due).days if (oldest_due and net_receivable > 0) else 0

        return {
            "student_id": student_id,
            "billed_to_date": billed_to_date,
            "total_settled": total_settled,
            "net_receivable": net_receivable,
            "credit_balance": credit_balance,
            "days_overdue": max(0, days_overdue),
        }

    def _debt_query(self, today: date, filters: dict):
        """Set-based debt query. Read-only: never generates schedules."""
        billed_sub = (
            select(
                Charge.enrollment_id.label("enrollment_id"),
                func.coalesce(func.sum(Charge.amount), ZERO).label("billed"),
                func.min(
                    case((Charge.status == ChargeStatus.OPEN, Charge.due_date), else_=None)
                ).label("oldest_open_due"),
            )
            .filter(
                Charge.due_date <= today,
                Charge.status != ChargeStatus.CANCELLED,
                Charge.is_deleted == False,  # noqa: E712
            )
            .group_by(Charge.enrollment_id)
            .subquery()
        )

        alloc_sub = (
            select(
                Charge.enrollment_id.label("enrollment_id"),
                func.coalesce(func.sum(Allocation.amount), ZERO).label("allocated"),
            )
            .join(Allocation, Allocation.charge_id == Charge.id)
            .filter(
                Charge.due_date <= today,
                Charge.status != ChargeStatus.CANCELLED,
                Charge.is_deleted == False,  # noqa: E712
                Allocation.reversed_by_entry_id.is_(None),
            )
            .group_by(Charge.enrollment_id)
            .subquery()
        )

        billed_expr = func.coalesce(billed_sub.c.billed, ZERO)
        allocated_expr = func.coalesce(alloc_sub.c.allocated, ZERO)
        debt_expr = billed_expr - allocated_expr
        overdue_expr = case(
            (billed_sub.c.oldest_open_due.is_(None), 0),
            (debt_expr <= ZERO, 0),
            else_=cast(literal(today), Date) - billed_sub.c.oldest_open_due,
        )

        query = (
            select(
                Enrollment,
                User,
                Course,
                billed_expr.label("billed"),
                allocated_expr.label("allocated"),
                debt_expr.label("debt"),
                overdue_expr.label("overdue_days"),
            )
            .join(User, User.id == Enrollment.student_id)
            .join(Course, Course.id == Enrollment.course_id)
            .outerjoin(billed_sub, billed_sub.c.enrollment_id == Enrollment.id)
            .outerjoin(alloc_sub, alloc_sub.c.enrollment_id == Enrollment.id)
            .filter(Enrollment.is_deleted == False)  # noqa: E712
        )

        if filters.get("course_id"):
            query = query.filter(Enrollment.course_id == filters["course_id"])
        if filters.get("status"):
            query = query.filter(Enrollment.status == filters["status"])

        min_debt = filters.get("min_debt")
        if min_debt is not None:
            query = query.filter(debt_expr >= Decimal(str(min_debt)))
        else:
            query = query.filter(debt_expr > ZERO)

        overdue_filter = filters.get("overdue_days")
        if overdue_filter is not None:
            query = query.filter(overdue_expr >= overdue_filter)

        return query, debt_expr

    async def get_debts(self, filters: dict, page: int, page_size: int) -> dict:
        page_size = min(max(1, page_size), 100)
        today = get_dushanbe_today()

        query, debt_expr = self._debt_query(today, filters)

        count_res = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_res.scalar() or 0

        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        offset = (page - 1) * page_size

        res = await self.db.execute(
            query.order_by(debt_expr.desc(), Enrollment.id.asc()).offset(offset).limit(page_size)
        )

        items = []
        for enrollment, student, course, billed, allocated, debt, overdue_days in res.all():
            items.append(
                {
                    "student": {
                        "id": student.id,
                        "first_name": student.first_name,
                        "last_name": student.last_name,
                        "email": student.email,
                        "payment_day_of_month": student.payment_day_of_month,
                    },
                    "course": {"id": course.id, "title": course.title},
                    "price_at_enrollment": enrollment.price_at_enrollment,
                    "billed_to_date": Decimal(billed or 0),
                    "total_paid": Decimal(allocated or 0),
                    "debt": Decimal(debt or 0),
                    "overdue_days": max(0, int(overdue_days or 0)),
                }
            )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def get_analytics(self, date_from: date, date_to: date) -> dict:
        cache_key = f"finance:analytics:{date_from.isoformat()}:{date_to.isoformat()}"
        cached = await redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        today = get_dushanbe_today()
        active_enrollment = and_(
            Enrollment.status == EnrollmentStatus.ACTIVE,
            Enrollment.is_deleted == False,  # noqa: E712
        )
        billed_to_date_clause = and_(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED)

        gross_res = await self.db.execute(
            select(func.coalesce(func.sum(Charge.amount), ZERO))
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(active_enrollment, Charge.is_deleted == False, Charge.status != ChargeStatus.CANCELLED)  # noqa: E712
        )
        gross_contract_value = Decimal(gross_res.scalar() or 0)

        billed_res = await self.db.execute(
            select(func.coalesce(func.sum(Charge.amount), ZERO))
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(active_enrollment, Charge.is_deleted == False, billed_to_date_clause)  # noqa: E712
        )
        billed_to_date = Decimal(billed_res.scalar() or 0)

        settled_res = await self.db.execute(
            select(func.coalesce(func.sum(Allocation.amount), ZERO))
            .join(Charge, Charge.id == Allocation.charge_id)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(
                active_enrollment,
                Charge.is_deleted == False,  # noqa: E712
                billed_to_date_clause,
                Allocation.reversed_by_entry_id.is_(None),
            )
        )
        settled_to_date = Decimal(settled_res.scalar() or 0)
        net_receivable = max(ZERO, billed_to_date - settled_to_date)

        # Period bounds: local Dushanbe midnight-to-midnight, expressed in UTC.
        dt_from = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET
        dt_to = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc) - DUSHANBE_TZ_OFFSET

        in_period = and_(LedgerEntry.occurred_at >= dt_from, LedgerEntry.occurred_at <= dt_to)
        voided = self._voided_ids_subquery()

        collected_res = await self.db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
                LedgerEntry.type == LedgerEntryType.PAYMENT,
                LedgerEntry.id.notin_(voided),
                in_period,
            )
        )
        payments_collected = Decimal(collected_res.scalar() or 0)

        refunds_res = await self.db.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), ZERO)).filter(
                LedgerEntry.type == LedgerEntryType.REFUND,
                LedgerEntry.is_cash_out.is_(True),
                in_period,
            )
        )
        refunds_paid_out = Decimal(refunds_res.scalar() or 0)
        collected_in_period = payments_collected - refunds_paid_out

        # Like-for-like denominator: what fell due inside the same window.
        billed_in_period_res = await self.db.execute(
            select(func.coalesce(func.sum(Charge.amount), ZERO))
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(
                active_enrollment,
                Charge.is_deleted == False,  # noqa: E712
                Charge.status != ChargeStatus.CANCELLED,
                Charge.due_date >= date_from,
                Charge.due_date <= date_to,
            )
        )
        billed_in_period = Decimal(billed_in_period_res.scalar() or 0)

        outstanding_credit = await self._total_outstanding_credit()
        aging = await self._aging_buckets(today)

        debt_query, debt_expr = self._debt_query(today, {})
        debt_sub = debt_query.subquery()
        unpaid_res = await self.db.execute(
            select(func.count(func.distinct(debt_sub.c.student_id))).select_from(debt_sub)
        )
        unpaid_students_count = unpaid_res.scalar() or 0

        top_debtors = await self.get_debts(filters={}, page=1, page_size=10)
        debtors_preview = [
            {
                "student_id": item["student"]["id"],
                "first_name": item["student"]["first_name"],
                "last_name": item["student"]["last_name"],
                "email": item["student"]["email"],
                "debt": float(item["debt"]),
            }
            for item in top_debtors["items"]
        ]

        collection_rate = (
            float((collected_in_period / billed_in_period).quantize(Decimal("0.0001")))
            if billed_in_period > 0
            else 0.0
        )

        analytics = {
            "gross_contract_value": float(gross_contract_value),
            "billed_to_date": float(billed_to_date),
            "billed_in_period": float(billed_in_period),
            "net_receivable": float(net_receivable),
            "collected_in_period": float(collected_in_period),
            "outstanding_credit": float(outstanding_credit),
            "aging": {
                "d0_30": float(aging[0]),
                "d31_60": float(aging[1]),
                "d61_90": float(aging[2]),
                "d90_plus": float(aging[3]),
            },
            "unpaid_students_count": int(unpaid_students_count),
            "collection_rate": collection_rate,
            "debtors_preview": debtors_preview,
        }

        await redis_client.set(cache_key, json.dumps(analytics), ex=600)
        return analytics

    async def _total_outstanding_credit(self) -> Decimal:
        """Sum of every student's wallet, computed in three set-based queries."""
        voided = self._voided_ids_subquery()

        credit_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
            .filter(LedgerEntry.type.in_(CREDIT_TYPES), LedgerEntry.id.notin_(voided))
            .group_by(LedgerEntry.student_id)
        )
        credit = {row[0]: Decimal(row[1] or 0) for row in credit_res.all()}

        cash_out_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
            .filter(LedgerEntry.type == LedgerEntryType.REFUND, LedgerEntry.is_cash_out.is_(True))
            .group_by(LedgerEntry.student_id)
        )
        cash_out = {row[0]: Decimal(row[1] or 0) for row in cash_out_res.all()}

        allocated_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(Allocation.amount), ZERO))
            .join(Allocation, Allocation.ledger_entry_id == LedgerEntry.id)
            .filter(
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
                Allocation.reversed_by_entry_id.is_(None),
            )
            .group_by(LedgerEntry.student_id)
        )
        allocated = {row[0]: Decimal(row[1] or 0) for row in allocated_res.all()}

        total = ZERO
        for student_id, amount in credit.items():
            wallet = amount - cash_out.get(student_id, ZERO) - allocated.get(student_id, ZERO)
            if wallet > ZERO:
                total += wallet
        return total

    async def _aging_buckets(self, today: date) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
        """Outstanding balance bucketed by the age of the oldest open charge."""
        alloc_sub = (
            select(
                Allocation.charge_id.label("charge_id"),
                func.coalesce(func.sum(Allocation.amount), ZERO).label("allocated"),
            )
            .filter(Allocation.reversed_by_entry_id.is_(None))
            .group_by(Allocation.charge_id)
            .subquery()
        )

        res = await self.db.execute(
            select(
                Charge.due_date,
                Charge.amount - func.coalesce(alloc_sub.c.allocated, ZERO),
            )
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .outerjoin(alloc_sub, alloc_sub.c.charge_id == Charge.id)
            .filter(
                Enrollment.status == EnrollmentStatus.ACTIVE,
                Enrollment.is_deleted == False,  # noqa: E712
                Charge.is_deleted == False,  # noqa: E712
                Charge.status == ChargeStatus.OPEN,
                Charge.due_date <= today,
            )
        )

        buckets = [ZERO, ZERO, ZERO, ZERO]
        for due_date, remaining in res.all():
            remaining = Decimal(remaining or 0)
            if remaining <= ZERO:
                continue
            overdue = (today - due_date).days
            if overdue <= 30:
                buckets[0] += remaining
            elif overdue <= 60:
                buckets[1] += remaining
            elif overdue <= 90:
                buckets[2] += remaining
            else:
                buckets[3] += remaining
        return tuple(buckets)  # type: ignore[return-value]

    async def list_charges(self, filters: dict, page: int, page_size: int) -> dict:
        alloc_sub = (
            select(
                Allocation.charge_id.label("charge_id"),
                func.coalesce(func.sum(Allocation.amount), ZERO).label("allocated"),
            )
            .filter(Allocation.reversed_by_entry_id.is_(None))
            .group_by(Allocation.charge_id)
            .subquery()
        )

        query = (
            select(Charge, Course.title, func.coalesce(alloc_sub.c.allocated, ZERO))
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .join(Course, Course.id == Enrollment.course_id)
            .outerjoin(alloc_sub, alloc_sub.c.charge_id == Charge.id)
            .filter(Charge.is_deleted == False)  # noqa: E712
        )

        if filters.get("student_id"):
            query = query.filter(Charge.student_id == filters["student_id"])
        if filters.get("enrollment_id"):
            query = query.filter(Charge.enrollment_id == filters["enrollment_id"])
        if filters.get("status"):
            query = query.filter(Charge.status == filters["status"])

        query = query.order_by(Charge.due_date.asc(), Charge.id.asc())

        count_res = await self.db.execute(select(func.count()).select_from(query.subquery()))
        total = count_res.scalar() or 0

        page_size = min(max(1, page_size), 100)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        offset = (page - 1) * page_size

        res = await self.db.execute(query.offset(offset).limit(page_size))

        items = []
        for charge, course_title, allocated in res.all():
            allocated = Decimal(allocated or 0)
            items.append(
                {
                    "id": charge.id,
                    "enrollment_id": charge.enrollment_id,
                    "student_id": charge.student_id,
                    "sequence_no": charge.sequence_no,
                    "amount": charge.amount,
                    "due_date": charge.due_date,
                    "type": charge.type,
                    "status": charge.status,
                    "allocated_amount": allocated,
                    "remaining_balance": max(ZERO, charge.amount - allocated),
                    "course_title": course_title,
                }
            )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def list_student_credits(self) -> List[dict]:
        """Students holding a positive wallet balance — three queries, no loop."""
        voided = self._voided_ids_subquery()

        credit_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
            .filter(LedgerEntry.type.in_(CREDIT_TYPES), LedgerEntry.id.notin_(voided))
            .group_by(LedgerEntry.student_id)
        )
        credit = {row[0]: Decimal(row[1] or 0) for row in credit_res.all()}
        if not credit:
            return []

        cash_out_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(LedgerEntry.amount), ZERO))
            .filter(LedgerEntry.type == LedgerEntryType.REFUND, LedgerEntry.is_cash_out.is_(True))
            .group_by(LedgerEntry.student_id)
        )
        cash_out = {row[0]: Decimal(row[1] or 0) for row in cash_out_res.all()}

        allocated_res = await self.db.execute(
            select(LedgerEntry.student_id, func.coalesce(func.sum(Allocation.amount), ZERO))
            .join(Allocation, Allocation.ledger_entry_id == LedgerEntry.id)
            .filter(
                LedgerEntry.type.in_(CREDIT_TYPES),
                LedgerEntry.id.notin_(voided),
                Allocation.reversed_by_entry_id.is_(None),
            )
            .group_by(LedgerEntry.student_id)
        )
        allocated = {row[0]: Decimal(row[1] or 0) for row in allocated_res.all()}

        balances = {
            sid: amount - cash_out.get(sid, ZERO) - allocated.get(sid, ZERO)
            for sid, amount in credit.items()
        }
        positive = {sid: bal for sid, bal in balances.items() if bal > ZERO}
        if not positive:
            return []

        students_res = await self.db.execute(select(User).filter(User.id.in_(list(positive.keys()))))
        return [
            {
                "student_id": student.id,
                "student_name": f"{student.first_name} {student.last_name}",
                "email": student.email,
                "credit_balance": positive[student.id],
            }
            for student in students_res.scalars().all()
        ]

    async def get_payment_receipt(self, payment_id: int) -> dict:
        entry = await self._get_payment_entry(payment_id)

        student_res = await self.db.execute(select(User).filter(User.id == entry.student_id))
        student = student_res.scalars().first()

        accepted_res = await self.db.execute(select(User).filter(User.id == entry.recorded_by_id))
        accepted_by = accepted_res.scalars().first()

        alloc_res = await self.db.execute(
            select(Allocation, Charge, Course)
            .join(Charge, Charge.id == Allocation.charge_id)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .join(Course, Course.id == Enrollment.course_id)
            .filter(
                Allocation.ledger_entry_id == entry.id,
                Allocation.reversed_by_entry_id.is_(None),
            )
        )

        allocations = [
            {
                "charge_id": charge.id,
                "charge_type": charge.type,
                "course_title": course.title,
                "due_date": charge.due_date.isoformat(),
                "allocated_amount": alloc.amount,
            }
            for alloc, charge, course in alloc_res.all()
        ]

        return {
            "receipt_number": f"REC-{entry.id:06d}",
            "occurred_at": entry.occurred_at,
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.last_name}",
            "student_email": student.email,
            "amount": entry.amount,
            "method": entry.method,
            "accepted_by_name": f"{accepted_by.first_name} {accepted_by.last_name}" if accepted_by else "Staff",
            "allocations": allocations,
            "comment": entry.comment,
        }

    # ------------------------------------------------------------------
    # Accounting periods
    # ------------------------------------------------------------------

    async def close_period(
        self, year: int, month: int, payload: ClosePeriodPayload, current_user: User
    ) -> AccountingPeriod:
        if current_user.role != UserRole.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SuperAdmin can close accounting periods",
            )

        res = await self.db.execute(
            select(AccountingPeriod).filter(AccountingPeriod.year == year, AccountingPeriod.month == month)
        )
        period = res.scalars().first()
        if not period:
            period = AccountingPeriod(year=year, month=month)
            self.db.add(period)
            await self.db.flush()

        period.status = AccountingPeriodStatus.CLOSED
        period.closed_by_id = current_user.id
        period.closed_at = datetime.now(timezone.utc)
        period.reopen_reason = None
        await self.db.flush()
        await self.db.refresh(period)

        await self._log_audit(
            user_id=current_user.id,
            action="close_period",
            entity_type="accounting_period",
            entity_id=period.id,
            changes={"year": year, "month": month, "status": ("open", "closed")},
        )
        return period

    async def reopen_period(
        self, year: int, month: int, payload: ReopenPeriodPayload, current_user: User
    ) -> AccountingPeriod:
        if current_user.role != UserRole.SUPERADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only SuperAdmin can reopen accounting periods",
            )

        res = await self.db.execute(
            select(AccountingPeriod).filter(AccountingPeriod.year == year, AccountingPeriod.month == month)
        )
        period = res.scalars().first()
        if not period:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accounting period not found")

        period.status = AccountingPeriodStatus.OPEN
        period.reopen_reason = payload.reason_code
        period.closed_by_id = None
        period.closed_at = None
        await self.db.flush()
        await self.db.refresh(period)

        await self._log_audit(
            user_id=current_user.id,
            action="reopen_period",
            entity_type="accounting_period",
            entity_id=period.id,
            changes={"year": year, "month": month, "status": ("closed", "open"), "reason_code": payload.reason_code},
        )
        return period
