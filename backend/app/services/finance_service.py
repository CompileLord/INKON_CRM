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

from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
import calendar
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Date, Result, Select, and_, case, cast, func, literal, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.models.accounting_period import AccountingPeriod, AccountingPeriodStatus
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus, ChargeType
from app.models.course import Course
from app.models.enrollment import BillingMode, Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.payment_target import PaymentTarget
from app.schemas.payment import PaymentTargetInput
from app.models.user import User, UserRole
from app.schemas.accounting_period import ClosePeriodPayload, ReopenPeriodPayload
from app.schemas.common import InstallmentPriceInput, PositiveMoney
from app.schemas.ledger import (
    AdjustmentCreatePayload,
    AllocationCreatePayload,
    DiscountCreatePayload,
    RefundPaymentPayload,
    VoidPaymentPayload,
)
from app.core.redis import redis_client
from app.services.analytics_cache_service import AnalyticsCacheService
from app.repositories.interfaces.cache_generation_repository import CacheGenerationRepository
from app.repositories.sqlalchemy.cache_generation_repository import SQLAlchemyCacheGenerationRepository


# The centre operates on Asia/Dushanbe (UTC+5, no DST).
DUSHANBE_TZ_OFFSET = timedelta(hours=5)

GRANT_WRITE_OFF_REASON_CODE: str = "grant_write_off"
ANALYTICS_CACHE_KEY_PREFIX: str = "finance:analytics:v3:"
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


class CourseMonthCalendar:
    @staticmethod
    def start(start_date: date, month_index: int) -> date:
        month_number: int = start_date.year * 12 + start_date.month - 1 + month_index
        year: int = month_number // 12
        month: int = month_number % 12 + 1
        return date(year, month, min(start_date.day, calendar.monthrange(year, month)[1]))

    @classmethod
    def billed_starts(cls, start_date: date, end_date: date, enrollment_date: date) -> list[date]:
        starts: list[date] = []
        month_index: int = 0
        while cls.start(start_date, month_index) < end_date:
            month_start: date = cls.start(start_date, month_index)
            if cls.start(start_date, month_index + 1) > enrollment_date:
                starts.append(month_start)
            month_index += 1
        return starts


@dataclass(frozen=True)
class PlannedCharge:
    sequence_no: int
    period_start: date
    due_date: date
    amount: Decimal


@dataclass(frozen=True)
class BillingModeChangeOutcome:
    cancelled_months: int
    cancelled_amount: Decimal
    written_off_amount: Decimal
    generated_months: int


class FinanceService:
    _positive_money_adapter: TypeAdapter[Decimal] = TypeAdapter(PositiveMoney)
    PERIOD_LOCK_NAMESPACE: int = 36

    def __init__(self, db: AsyncSession, cache_generation_repo: CacheGenerationRepository | None = None) -> None:
        self.db: AsyncSession = db
        self.cache_generation_repo: CacheGenerationRepository = cache_generation_repo or SQLAlchemyCacheGenerationRepository(db)

    async def lock_student_accounts(self, student_ids: Sequence[int]) -> None:
        ordered_student_ids: list[int] = sorted(set(student_ids))
        if not ordered_student_ids:
            return
        await self.db.execute(
            select(User.id)
            .where(User.id.in_(ordered_student_ids))
            .order_by(User.id)
            .with_for_update()
        )
        self.cache_generation_repo.mark_account_lock()

    # ------------------------------------------------------------------
    # Infrastructure helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _period_lock_key(year: int, month: int) -> int:
        return year * 12 + (month - 1)

    async def _acquire_period_locks(self, period_keys: Sequence[int], exclusive: bool) -> None:
        lock_function: str = "pg_advisory_xact_lock" if exclusive else "pg_advisory_xact_lock_shared"
        for period_key in sorted(set(period_keys)):
            await self.db.execute(
                text(f"SELECT {lock_function}(:namespace, :period_key)"),
                {"namespace": self.PERIOD_LOCK_NAMESPACE, "period_key": period_key},
            )

    async def _check_periods_open(self, dated_entries: Sequence[tuple[datetime, str]]) -> None:
        local_dates: list[tuple[datetime, str]] = [
            (_to_dushanbe(occurred_at), what) for occurred_at, what in dated_entries
        ]
        await self._acquire_period_locks(
            [self._period_lock_key(local_dt.year, local_dt.month) for local_dt, _ in local_dates],
            exclusive=False,
        )
        for local_dt, what in local_dates:
            query: Select[tuple[AccountingPeriod]] = select(AccountingPeriod).filter(
                AccountingPeriod.year == local_dt.year,
                AccountingPeriod.month == local_dt.month,
            )
            res: Result[tuple[AccountingPeriod]] = await self.db.execute(query)
            period: Optional[AccountingPeriod] = res.scalars().first()
            if period is not None and period.status == AccountingPeriodStatus.CLOSED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Accounting period {local_dt.year}-{local_dt.month:02d} is closed; "
                        f"cannot record {what}. Post an adjustment in the open period instead."
                    ),
                )

    async def _check_period_open(self, occurred_at: datetime, what: str = "entry") -> None:
        await self._check_periods_open([(occurred_at, what)])

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
        await self.cache_generation_repo.advance()

    # ------------------------------------------------------------------
    # Ledger primitives
    # ------------------------------------------------------------------

    def _voided_ids_subquery(self):
        return select(LedgerEntry.reverses_entry_id).filter(
            LedgerEntry.type == LedgerEntryType.VOID,
            LedgerEntry.reverses_entry_id.isnot(None),
        )

    async def _ensure_payment_reversal_eligible(
        self,
        payment_entry: LedgerEntry,
        reversal_type: LedgerEntryType,
    ) -> None:
        void_id: int | None = await self.db.scalar(
            select(LedgerEntry.id)
            .where(
                LedgerEntry.reverses_entry_id == payment_entry.id,
                LedgerEntry.type == LedgerEntryType.VOID,
            )
            .limit(1)
        )
        if void_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment has already been voided",
            )

        if reversal_type == LedgerEntryType.VOID:
            refund_id: int | None = await self.db.scalar(
                select(LedgerEntry.id)
                .where(
                    LedgerEntry.reverses_entry_id == payment_entry.id,
                    LedgerEntry.type == LedgerEntryType.REFUND,
                )
                .limit(1)
            )
            if refund_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Payment has been refunded and can no longer be voided",
                )

    @staticmethod
    def _consumed_credit_allocation() -> ColumnElement[bool]:
        reversal: Any = aliased(LedgerEntry)
        return or_(
            Allocation.reversed_by_entry_id.is_(None),
            and_(LedgerEntry.type == LedgerEntryType.ADJUSTMENT,
                 Allocation.reversed_by_entry_id.in_(select(reversal.id).where(
                     reversal.type == LedgerEntryType.WITHDRAWAL_REVERSAL))),
        )

    async def _active_allocated(self, entry_ids: Sequence[int]) -> Decimal:
        if not entry_ids:
            return ZERO
        q = select(func.coalesce(func.sum(Allocation.amount), ZERO)).join(
            LedgerEntry, LedgerEntry.id == Allocation.ledger_entry_id,
        ).filter(
            Allocation.ledger_entry_id.in_(entry_ids),
            self._consumed_credit_allocation(),
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
        await self._invalidate_cache()

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
        await self.lock_student_accounts([student_id])
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
                self._consumed_credit_allocation(),
            )
        )
        allocated = Decimal(allocated_res.scalar() or 0)

        return max(ZERO, credit_total - cash_out - allocated)

    # ------------------------------------------------------------------
    # Schedule generation
    # ------------------------------------------------------------------

    @staticmethod
    def validate_installment_price(price: Decimal, start_date: date, end_date: date) -> None:
        try:
            InstallmentPriceInput(price=price, start_date=start_date, end_date=end_date)
        except ValidationError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Monthly price must be positive valid money",
            ) from error

    @classmethod
    def plan_schedule(
        cls, course: Course, student: User, price: Decimal, enrollment_date: date,
    ) -> list[PlannedCharge]:
        cls.validate_installment_price(price, course.start_date, course.end_date)
        if enrollment_date >= course.end_date:
            return []
        payment_day: int = student.payment_day_of_month or min(28, course.start_date.day)
        planned: list[PlannedCharge] = []
        course_month_start: date
        for course_month_start in CourseMonthCalendar.billed_starts(course.start_date, course.end_date, enrollment_date):
            year: int = course_month_start.year
            month: int = course_month_start.month
            month_index: int = (year - course.start_date.year) * 12 + month - course.start_date.month
            next_course_month_start: date = CourseMonthCalendar.start(course.start_date, month_index + 1)
            next_year: int = next_course_month_start.year
            next_month: int = next_course_month_start.month
            due_date: date = date(year, month, min(payment_day, calendar.monthrange(year, month)[1]))
            if due_date < course_month_start:
                due_date = date(next_year, next_month, min(payment_day, calendar.monthrange(next_year, next_month)[1]))
            if due_date >= next_course_month_start:
                due_date = next_course_month_start - timedelta(days=1)
            if not planned:
                due_date = max(due_date, enrollment_date)
            planned.append(PlannedCharge(
                sequence_no=len(planned) + 1, period_start=course_month_start, due_date=due_date, amount=price,
            ))
        return planned

    @staticmethod
    def _charge_from_plan(enrollment_id: int, student_id: int, planned_charge: PlannedCharge) -> Charge:
        return Charge(
            enrollment_id=enrollment_id,
            student_id=student_id,
            sequence_no=planned_charge.sequence_no,
            amount=planned_charge.amount,
            due_date=planned_charge.due_date,
            type=ChargeType.TUITION,
            status=ChargeStatus.OPEN,
        )

    async def generate_schedule_for_enrollment(self, enrollment_id: int) -> List[Charge]:
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
        await self.lock_student_accounts([student.id])

        if enrollment.billing_mode == BillingMode.GRANT:
            return []

        existing_res = await self.db.execute(
            select(Charge).filter(
                Charge.enrollment_id == enrollment.id,
                Charge.is_deleted == False,  # noqa: E712
            )
        )
        existing = list(existing_res.scalars().all())
        if existing:
            return existing

        planned: list[PlannedCharge] = self.plan_schedule(
            course, student, Decimal(enrollment.price_at_enrollment), _to_dushanbe(enrollment.enrolled_at).date(),
        )
        charges: List[Charge] = [self._charge_from_plan(enrollment.id, student.id, planned_charge) for planned_charge in planned]
        self.db.add_all(charges)

        await self.db.flush()
        await self._invalidate_cache()
        return charges

    async def withdrawal_calculation(
        self, enrollment: Enrollment, course: Course, withdrawal_date: date,
    ) -> tuple[list[Charge], list[Allocation], Decimal, Decimal]:
        starts: list[date] = CourseMonthCalendar.billed_starts(
            course.start_date, course.end_date, _to_dushanbe(enrollment.enrolled_at).date(),
        )
        charges: list[Charge] = list((await self.db.scalars(select(Charge).where(
            Charge.enrollment_id == enrollment.id,
            Charge.is_deleted.is_(False),
            Charge.status != ChargeStatus.CANCELLED,
        ))).all())
        allocations: list[Allocation] = list((await self.db.scalars(select(Allocation).join(
            Charge, Charge.id == Allocation.charge_id,
        ).where(
            Charge.enrollment_id == enrollment.id,
            Charge.is_deleted.is_(False),
            Charge.status != ChargeStatus.CANCELLED,
            Allocation.reversed_by_entry_id.is_(None),
        ))).all())
        cancelled: list[Charge] = []
        cancelled_ids: set[int] = set()
        charge: Charge
        for charge in charges:
            if charge.type != ChargeType.TUITION:
                continue
            if charge.sequence_no < 1 or charge.sequence_no > len(starts):
                raise ValueError("Tuition charge cannot be matched to a course month")
            if starts[charge.sequence_no - 1] >= withdrawal_date:
                cancelled.append(charge)
                cancelled_ids.add(charge.id)
        allocation_totals: Any = select(
            Allocation.charge_id, func.sum(Allocation.amount).label("amount"),
        ).where(Allocation.reversed_by_entry_id.is_(None)).group_by(Allocation.charge_id).subquery()
        totals: Any = (await self.db.execute(select(
            func.coalesce(func.sum(case(
                (Charge.id.not_in(cancelled_ids), func.greatest(
                    Charge.amount - func.coalesce(allocation_totals.c.amount, ZERO), ZERO)), else_=ZERO,
            )), ZERO),
            func.coalesce(func.sum(case((Charge.id.in_(cancelled_ids), Charge.amount), else_=ZERO)), ZERO),
        ).outerjoin(allocation_totals, allocation_totals.c.charge_id == Charge.id).where(
            Charge.enrollment_id == enrollment.id, Charge.is_deleted.is_(False),
            Charge.status != ChargeStatus.CANCELLED,
        ))).one()
        owed: Decimal = Decimal(totals[0])
        cancelled_amount: Decimal = Decimal(totals[1])
        return cancelled, [allocation for allocation in allocations if allocation.charge_id in cancelled_ids], owed, cancelled_amount

    async def reverse_withdrawal_allocations(
        self, student_id: int, actor_id: int, allocations: list[Allocation],
    ) -> None:
        if not allocations:
            return
        amount: Decimal = Decimal(await self.db.scalar(select(func.sum(Allocation.amount)).where(
            Allocation.id.in_([allocation.id for allocation in allocations]),
        )) or ZERO)
        reversal: LedgerEntry = LedgerEntry(
            student_id=student_id, type=LedgerEntryType.WITHDRAWAL_REVERSAL,
            amount=amount, occurred_at=datetime.now(timezone.utc), recorded_by_id=actor_id,
        )
        self.db.add(reversal)
        await self.db.flush()
        allocation: Allocation
        for allocation in allocations:
            allocation.reversed_by_entry_id = reversal.id
        await self.db.flush()

    async def convert_future_charges_to_grant(
        self, enrollment: Enrollment, course: Course, actor: User, reason: str, today: date,
    ) -> BillingModeChangeOutcome:
        future_charges: list[Charge]
        future_allocations: list[Allocation]
        future_charges, future_allocations, _, _ = await self.withdrawal_calculation(enrollment, course, today)
        allocated_by_charge: dict[int, Decimal] = {}
        allocation: Allocation
        for allocation in future_allocations:
            allocated_by_charge[allocation.charge_id] = allocated_by_charge.get(allocation.charge_id, ZERO) + allocation.amount
        cancelled_months: int = 0
        cancelled_amount: Decimal = ZERO
        written_off_amount: Decimal = ZERO
        charge: Charge
        for charge in future_charges:
            allocated: Decimal = allocated_by_charge.get(charge.id, ZERO)
            if allocated <= ZERO:
                charge.status = ChargeStatus.CANCELLED
                cancelled_months += 1
                cancelled_amount += charge.amount
                continue
            remainder: Decimal = charge.amount - allocated
            if remainder > ZERO:
                await self.create_discount(
                    DiscountCreatePayload(
                        student_id=enrollment.student_id, charge_id=charge.id, amount=remainder,
                        reason_code=GRANT_WRITE_OFF_REASON_CODE, comment=reason,
                    ),
                    actor,
                )
                written_off_amount += remainder
        await self.db.flush()
        await self._invalidate_cache()
        return BillingModeChangeOutcome(cancelled_months, cancelled_amount, written_off_amount, 0)

    async def resume_billing_after_grant(
        self, enrollment: Enrollment, student: User, course: Course, today: date,
    ) -> BillingModeChangeOutcome:
        existing_sequences: set[int] = set((await self.db.scalars(select(Charge.sequence_no).where(
            Charge.enrollment_id == enrollment.id,
            Charge.is_deleted.is_(False),
            Charge.type == ChargeType.TUITION,
            Charge.status != ChargeStatus.CANCELLED,
        ))).all())
        planned: list[PlannedCharge] = self.plan_schedule(
            course, student, Decimal(enrollment.price_at_enrollment), _to_dushanbe(enrollment.enrolled_at).date(),
        )
        new_charges: list[Charge] = [
            self._charge_from_plan(enrollment.id, student.id, planned_charge) for planned_charge in planned
            if planned_charge.period_start > today and planned_charge.sequence_no not in existing_sequences
        ]
        self.db.add_all(new_charges)
        await self.db.flush()
        await self._invalidate_cache()
        return BillingModeChangeOutcome(0, ZERO, ZERO, len(new_charges))

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    async def create_payment(
        self,
        student_id: int,
        course_id: Optional[int],
        amount: Decimal,
        paid_at: datetime,
        method: PaymentMethod,
        comment: Optional[str],
        current_user: User,
        targets: Optional[list[PaymentTargetInput]] = None,
    ) -> LedgerEntry:
        """Record cash received. ``amount`` is always the cash actually taken."""
        try:
            amount = self._positive_money_adapter.validate_python(amount)
        except ValidationError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount must be positive valid money with at most two decimal places and a maximum of 99999999.99",
            ) from error

        await self.lock_student_accounts([student_id])
        await self._check_period_open(paid_at, "payment")

        if targets is None:
            enrollment: Optional[Enrollment] = await self.db.scalar(select(Enrollment).where(
                Enrollment.student_id == student_id, Enrollment.course_id == course_id,
                Enrollment.is_deleted.is_(False),
            ))
            if enrollment is None:
                raise HTTPException(status_code=422, detail={"code": "invalid_payment_target"})
            targets = [PaymentTargetInput(enrollment_id=enrollment.id, amount=amount)]
        if sum((target.amount for target in targets), ZERO) != amount:
            raise HTTPException(status_code=422, detail={"code": "payment_target_sum_mismatch"})
        target_ids: list[int] = [target.enrollment_id for target in targets]
        if len(set(target_ids)) != len(target_ids):
            raise HTTPException(status_code=422, detail={"code": "duplicate_payment_target"})
        enrollment_rows: list[Enrollment] = list((await self.db.scalars(select(Enrollment).where(
            Enrollment.id.in_(target_ids), Enrollment.student_id == student_id,
            Enrollment.is_deleted.is_(False),
        ))).all())
        enrollments: dict[int, Enrollment] = {row.id: row for row in enrollment_rows}
        allocation_totals: Any = select(
            Allocation.charge_id, func.sum(Allocation.amount).label("amount"),
        ).where(Allocation.reversed_by_entry_id.is_(None)).group_by(Allocation.charge_id).subquery()
        balances: dict[int, Decimal] = {row.enrollment_id: Decimal(row.balance) for row in (await self.db.execute(
            select(Charge.enrollment_id, func.sum(Charge.amount - func.coalesce(allocation_totals.c.amount, ZERO)).label("balance"))
            .outerjoin(allocation_totals, allocation_totals.c.charge_id == Charge.id)
            .where(Charge.enrollment_id.in_(target_ids), Charge.status == ChargeStatus.OPEN, Charge.is_deleted.is_(False))
            .group_by(Charge.enrollment_id)
        )).all()}
        for target in targets:
            enrollment = enrollments.get(target.enrollment_id)
            if enrollment is None or (enrollment.status != EnrollmentStatus.ACTIVE and not (
                course_id is not None and enrollment.status == EnrollmentStatus.WITHDRAWN
            )):
                raise HTTPException(status_code=422, detail={"code": "invalid_payment_target"})
            maximum: Decimal = ZERO if enrollment.effective_billing_mode == BillingMode.GRANT else balances.get(target.enrollment_id, ZERO)
            if target.amount > maximum:
                raise HTTPException(status_code=422, detail={"code": "payment_target_exceeds_balance", "enrollment_id": target.enrollment_id, "maximum": format(maximum, ".2f")})

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

        self.db.add_all([PaymentTarget(ledger_entry_id=entry.id, enrollment_id=target.enrollment_id, amount=target.amount) for target in targets])
        charges: List[Charge] = list((await self.db.scalars(select(Charge).where(
            Charge.enrollment_id.in_(target_ids), Charge.status == ChargeStatus.OPEN,
            Charge.is_deleted.is_(False),
        ).order_by(Charge.due_date, Charge.sequence_no, Charge.id))).all())
        charge_ids: list[int] = [charge.id for charge in charges]
        allocated_rows: Any = await self.db.execute(select(Allocation.charge_id, func.sum(Allocation.amount)).where(
            Allocation.charge_id.in_(charge_ids), Allocation.reversed_by_entry_id.is_(None),
        ).group_by(Allocation.charge_id))
        allocated: dict[int, Decimal] = {charge_id: Decimal(total) for charge_id, total in allocated_rows.all()}
        remaining: dict[int, Decimal] = {target.enrollment_id: target.amount for target in targets}
        touched: list[int] = []
        for charge in charges:
            applied: Decimal = min(remaining[charge.enrollment_id], charge.amount - allocated.get(charge.id, ZERO))
            if applied > ZERO:
                self.db.add(Allocation(ledger_entry_id=entry.id, charge_id=charge.id, amount=applied))
                remaining[charge.enrollment_id] -= applied
                touched.append(charge.id)
        await self.db.flush()
        await self._recompute_charge_status(touched)

        await self._log_audit(
            user_id=current_user.id,
            action="create",
            entity_type="payment",
            entity_id=entry.id,
            changes={
                "amount": str(amount),
                "student_id": student_id,
                "targets": [{"enrollment_id": target.enrollment_id, "amount": format(target.amount, ".2f")} for target in targets],
                "method": str(method),
            },
        )
        await self._invalidate_cache()
        return await self._load_entry(entry.id)

    async def create_discount(self, payload: DiscountCreatePayload, current_user: User) -> LedgerEntry:
        """Record a concession that reduces the receivable without any cash."""
        await self.lock_student_accounts([payload.student_id])
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

        await self.lock_student_accounts([payload.student_id])
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
        await self.lock_student_accounts([target.student_id])
        await self._ensure_payment_reversal_eligible(target, LedgerEntryType.VOID)

        # Both the original period and the current one must be open: voiding
        # mutates allocations, which would silently restate a closed month.
        now: datetime = datetime.now(timezone.utc)
        await self._check_periods_open(
            [(target.occurred_at, "a void of an entry in that period"), (now, "void")]
        )

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
        await self.lock_student_accounts([target.student_id])
        await self._ensure_payment_reversal_eligible(target, LedgerEntryType.REFUND)

        now: datetime = datetime.now(timezone.utc)
        await self._check_periods_open(
            [(target.occurred_at, "a refund of an entry in that period"), (now, "refund")]
        )

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
        await self.lock_student_accounts([payload.student_id])
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

        target_rows: Any = await self.db.execute(
            select(PaymentTarget, Course).join(Enrollment, Enrollment.id == PaymentTarget.enrollment_id)
            .join(Course, Course.id == Enrollment.course_id).where(PaymentTarget.ledger_entry_id.in_(entry_ids))
            .order_by(PaymentTarget.id)
        )
        targets_by_entry: Dict[int, List[dict]] = {}
        for target, course in target_rows.all():
            targets_by_entry.setdefault(target.ledger_entry_id, []).append({
                "enrollment_id": target.enrollment_id, "course_id": course.id,
                "course_title": course.title, "amount": target.amount,
            })

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

        student_res = await self.db.execute(
            select(User.id, User.first_name, User.last_name).filter(
                User.id.in_({entry.student_id for entry in entries})
            )
        )
        student_names_by_id: Dict[int, Tuple[str, str]] = {
            row.id: (row.first_name, row.last_name) for row in student_res.all()
        }

        items = []
        for entry in entries:
            allocated = allocated_by_entry.get(entry.id, ZERO)
            student_first_name, student_last_name = student_names_by_id.get(entry.student_id, (None, None))
            items.append(
                {
                    "id": entry.id,
                    "student_id": entry.student_id,
                    "student_first_name": student_first_name,
                    "student_last_name": student_last_name,
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
                    "targets": targets_by_entry.get(entry.id, []),
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
            .filter(Enrollment.is_deleted.is_(False), User.is_deleted.is_(False))
        )

        if filters.get("course_id"):
            query = query.filter(Enrollment.course_id == filters["course_id"])
        if filters.get("student_id"):
            query = query.filter(Enrollment.student_id == filters["student_id"])
        if filters.get("status"):
            query = query.filter(Enrollment.status == filters["status"])

        min_debt = filters.get("min_debt")
        if min_debt is not None:
            query = query.filter(debt_expr >= min_debt)
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
                    "billing_mode": enrollment.effective_billing_mode,
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
        if not self.cache_generation_repo.can_use_shared_cache():
            return await self._compute_analytics(date_from, date_to)
        generation: int = await self.cache_generation_repo.read_committed_generation()
        cache_key: str = f"{ANALYTICS_CACHE_KEY_PREFIX}{generation}:{date_from.isoformat()}:{date_to.isoformat()}"

        async def compute() -> dict[str, object]:
            return await self._compute_analytics(date_from, date_to)

        return await AnalyticsCacheService(redis_client).get_or_compute(
            cache_key, compute, self.cache_generation_repo.can_use_shared_cache,
        )

    async def _compute_analytics(self, date_from: date, date_to: date) -> dict[str, object]:
        today = get_dushanbe_today()
        active_enrollment = and_(
            Enrollment.status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN]),
            Enrollment.is_deleted.is_(False),
            Enrollment.student.has(User.is_deleted.is_(False)),
        )
        billed_to_date_clause = and_(Charge.due_date <= today, Charge.status != ChargeStatus.CANCELLED)
        expected_revenue_enrollment = and_(
            active_enrollment,
            or_(Enrollment.billing_mode.is_(None), Enrollment.billing_mode != BillingMode.GRANT.value),
        )

        gross_res = await self.db.execute(
            select(func.coalesce(func.sum(Charge.amount), ZERO))
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .filter(expected_revenue_enrollment, Charge.is_deleted == False, Charge.status != ChargeStatus.CANCELLED)  # noqa: E712
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
                expected_revenue_enrollment,
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
                "debt": self._money_string(item["debt"]),
            }
            for item in top_debtors["items"]
        ]

        collection_rate = (
            str((collected_in_period / billed_in_period).quantize(Decimal("0.0001")))
            if billed_in_period > 0
            else "0.0000"
        )

        analytics = {
            "gross_contract_value": self._money_string(gross_contract_value),
            "billed_to_date": self._money_string(billed_to_date),
            "billed_in_period": self._money_string(billed_in_period),
            "net_receivable": self._money_string(net_receivable),
            "collected_in_period": self._money_string(collected_in_period),
            "outstanding_credit": self._money_string(outstanding_credit),
            "aging": {
                "d0_30": self._money_string(aging[0]),
                "d31_60": self._money_string(aging[1]),
                "d61_90": self._money_string(aging[2]),
                "d90_plus": self._money_string(aging[3]),
            },
            "unpaid_students_count": int(unpaid_students_count),
            "collection_rate": collection_rate,
            "debtors_preview": debtors_preview,
        }

        return analytics

    @staticmethod
    def _money_string(amount: Decimal) -> str:
        return str(Decimal(amount).quantize(Decimal("0.01")))

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
                self._consumed_credit_allocation(),
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
                Enrollment.status.in_([EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN]),
                Enrollment.is_deleted.is_(False),
                Enrollment.student.has(User.is_deleted.is_(False)),
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
            select(Charge, Course.title, Enrollment.billing_mode, func.coalesce(alloc_sub.c.allocated, ZERO))
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
        for charge, course_title, billing_mode, allocated in res.all():
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
                    "billing_mode": billing_mode,
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
                self._consumed_credit_allocation(),
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

    async def get_payment_options(self, student_id: int) -> dict:
        allocation_totals: Any = select(
            Allocation.charge_id, func.sum(Allocation.amount).label("amount"),
        ).where(Allocation.reversed_by_entry_id.is_(None)).group_by(Allocation.charge_id).subquery()
        balance: Any = Charge.amount - func.coalesce(allocation_totals.c.amount, ZERO)
        today: date = get_dushanbe_today()
        charge_totals: Any = select(
            Charge.enrollment_id,
            func.sum(balance).label("maximum"),
            func.sum(case((Charge.due_date <= today, balance), else_=ZERO)).label("open_debt"),
            func.min(case((Charge.due_date < today, Charge.due_date), else_=None)).label("oldest_due"),
        ).outerjoin(allocation_totals, allocation_totals.c.charge_id == Charge.id).where(
            Charge.status == ChargeStatus.OPEN, Charge.is_deleted.is_(False),
        ).group_by(Charge.enrollment_id).subquery()
        rows: Any = await self.db.execute(
            select(Enrollment, Course.title, charge_totals.c.maximum, charge_totals.c.open_debt, charge_totals.c.oldest_due)
            .join(Course, Course.id == Enrollment.course_id)
            .outerjoin(charge_totals, charge_totals.c.enrollment_id == Enrollment.id)
            .where(Enrollment.student_id == student_id, Enrollment.status == EnrollmentStatus.ACTIVE,
                   Enrollment.is_deleted.is_(False)).order_by(Course.title, Enrollment.id)
        )
        return {"wallet_credit": await self.get_unallocated_credit(student_id), "enrollments": [
            {"enrollment_id": enrollment.id, "course_id": enrollment.course_id, "course_title": title,
             "open_debt": debt or ZERO, "remaining_contract_maximum": maximum or ZERO,
             "overdue_days": max(0, (today - oldest_due).days) if oldest_due else 0,
             "billing_mode": enrollment.effective_billing_mode}
            for enrollment, title, maximum, debt, oldest_due in rows.all()
        ]}

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
            "targets": (await self._decorate_entries([entry]))[0]["targets"],
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

        await self._acquire_period_locks([self._period_lock_key(year, month)], exclusive=True)
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

        await self._acquire_period_locks([self._period_lock_key(year, month)], exclusive=True)
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
