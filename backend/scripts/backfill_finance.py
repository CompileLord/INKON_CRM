"""Backfill the charge/credit ledger from legacy ``payments`` rows.

Phase 2 of FINANCE_REDESIGN_PLAN.md. Run the dry-run first, have the accountant
sign off on the balance diff, then apply.

    python -m scripts.backfill_finance              # dry run (default)
    python -m scripts.backfill_finance --apply      # write, in one transaction

What it does
------------
1. Generates a charge schedule for every non-deleted enrollment that lacks one.
2. Converts each legacy payment into a ``payment`` ledger entry at its **full,
   pre-discount amount** — the cash the student actually handed over.
3. Where ``discount_percent > 0``, issues a separate ``discount`` entry for the
   concession (``amount * pct / 100``).

Why step 3 changes balances
---------------------------
The legacy formula credited ``amount * (1 - pct/100)`` toward the debt, so a
discount *increased* what a student owed — the inversion documented in §2.1 of
the plan. Backfilling the intended meaning **lowers** the recorded debt of every
student who ever received a discount. That difference is exactly what the
dry-run report lists, and it is what needs signing off before ``--apply``.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Tuple

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import Payment
from app.models.user import User
from app.services.finance_service import FinanceService, ZERO


def _money(value: Decimal) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def _legacy_debt_by_student(db) -> Dict[int, Decimal]:
    """Debt under the old formula: price - SUM(amount * (1 - pct/100))."""
    contracts_res = await db.execute(
        select(Enrollment.student_id, func.coalesce(func.sum(Enrollment.price_at_enrollment), ZERO))
        .filter(Enrollment.is_deleted == False)  # noqa: E712
        .group_by(Enrollment.student_id)
    )
    contracts = {row[0]: Decimal(row[1] or 0) for row in contracts_res.all()}

    payments_res = await db.execute(select(Payment.student_id, Payment.amount, Payment.discount_percent))
    effective: Dict[int, Decimal] = {}
    for student_id, amount, pct in payments_res.all():
        credit = Decimal(amount) * (Decimal("1.0") - Decimal(pct or 0) / Decimal("100.0"))
        effective[student_id] = effective.get(student_id, ZERO) + credit

    return {sid: _money(total - effective.get(sid, ZERO)) for sid, total in contracts.items()}


async def _new_debt_by_student(db) -> Dict[int, Decimal]:
    """Lifetime debt under the ledger: all charges less all active allocations."""
    charges_res = await db.execute(
        select(Charge.student_id, func.coalesce(func.sum(Charge.amount), ZERO))
        .filter(Charge.is_deleted == False)  # noqa: E712
        .group_by(Charge.student_id)
    )
    charged = {row[0]: Decimal(row[1] or 0) for row in charges_res.all()}

    alloc_res = await db.execute(
        select(Charge.student_id, func.coalesce(func.sum(Allocation.amount), ZERO))
        .join(Allocation, Allocation.charge_id == Charge.id)
        .filter(
            Charge.is_deleted == False,  # noqa: E712
            Allocation.reversed_by_entry_id.is_(None),
        )
        .group_by(Charge.student_id)
    )
    allocated = {row[0]: Decimal(row[1] or 0) for row in alloc_res.all()}

    return {sid: _money(total - allocated.get(sid, ZERO)) for sid, total in charged.items()}


async def _run(apply: bool) -> int:
    async with AsyncSessionLocal() as db:
        service = FinanceService(db)

        existing_entries = (await db.execute(select(func.count()).select_from(LedgerEntry))).scalar() or 0
        if existing_entries and apply:
            print(
                f"REFUSING: {existing_entries} ledger entries already exist. "
                "The backfill is a one-shot migration; re-running it would double-count.",
                file=sys.stderr,
            )
            return 2

        before = await _legacy_debt_by_student(db)

        # 1. Schedules ---------------------------------------------------
        enrollments_res = await db.execute(
            select(Enrollment.id).filter(Enrollment.is_deleted == False)  # noqa: E712
        )
        enrollment_ids = list(enrollments_res.scalars().all())

        schedules_created = 0
        for enrollment_id in enrollment_ids:
            existing = await db.execute(
                select(func.count())
                .select_from(Charge)
                .filter(Charge.enrollment_id == enrollment_id, Charge.is_deleted == False)  # noqa: E712
            )
            if (existing.scalar() or 0) == 0:
                await service.generate_schedule_for_enrollment(enrollment_id)
                schedules_created += 1

        # 2 & 3. Payments and discounts ----------------------------------
        payments_res = await db.execute(select(Payment).order_by(Payment.paid_at.asc(), Payment.id.asc()))
        payments = list(payments_res.scalars().all())

        payments_converted = 0
        discounts_created = 0
        discount_value = ZERO
        touched_students = set()

        for payment in payments:
            entry = LedgerEntry(
                student_id=payment.student_id,
                type=LedgerEntryType.PAYMENT,
                amount=payment.amount,
                method=payment.method,
                occurred_at=payment.paid_at,
                recorded_by_id=payment.accepted_by_id,
                comment=payment.comment,
                reason_code="backfill",
            )
            db.add(entry)
            payments_converted += 1
            touched_students.add(payment.student_id)

            if payment.discount_percent and payment.discount_percent > 0:
                concession = _money(
                    Decimal(payment.amount) * Decimal(payment.discount_percent) / Decimal("100.0")
                )
                if concession > ZERO:
                    db.add(
                        LedgerEntry(
                            student_id=payment.student_id,
                            type=LedgerEntryType.DISCOUNT,
                            amount=concession,
                            occurred_at=payment.paid_at,
                            recorded_by_id=payment.accepted_by_id,
                            reason_code="backfill",
                            comment=f"Backfilled {payment.discount_percent}% discount on legacy payment #{payment.id}",
                        )
                    )
                    discounts_created += 1
                    discount_value += concession

        await db.flush()

        for student_id in sorted(touched_students):
            await service.auto_allocate_student_credit(student_id)

        # Discounts must be applied too — they reduce the receivable.
        discount_entries_res = await db.execute(
            select(LedgerEntry).filter(
                LedgerEntry.type == LedgerEntryType.DISCOUNT,
                LedgerEntry.reason_code == "backfill",
            )
        )
        for entry in discount_entries_res.scalars().all():
            open_charges = await service._open_charges(entry.student_id)
            if open_charges:
                await service._apply_credit([entry], open_charges)

        after = await _new_debt_by_student(db)

        # Report ---------------------------------------------------------
        student_ids = sorted(set(before) | set(after))
        names_res = await db.execute(select(User).filter(User.id.in_(student_ids))) if student_ids else None
        names = (
            {u.id: f"{u.first_name} {u.last_name}" for u in names_res.scalars().all()} if names_res else {}
        )

        changed: List[Tuple[int, str, Decimal, Decimal, Decimal]] = []
        for sid in student_ids:
            old = before.get(sid, ZERO)
            new = after.get(sid, ZERO)
            if old != new:
                changed.append((sid, names.get(sid, f"student #{sid}"), old, new, new - old))

        mode = "APPLY" if apply else "DRY RUN"
        print(f"=== Finance ledger backfill — {mode} ===")
        print(f"Enrollments scheduled : {schedules_created}")
        print(f"Payments converted    : {payments_converted}")
        print(f"Discount entries      : {discounts_created} (total {discount_value})")
        print(f"Students with changed balance: {len(changed)} of {len(student_ids)}")
        print()

        if changed:
            print(f"{'Student':<32}{'before':>14}{'after':>14}{'delta':>14}")
            print("-" * 74)
            for _sid, name, old, new, delta in changed:
                print(f"{name[:31]:<32}{old:>14}{new:>14}{delta:>+14}")
            print("-" * 74)
            print(
                f"{'TOTAL':<32}"
                f"{sum(c[2] for c in changed):>14}"
                f"{sum(c[3] for c in changed):>14}"
                f"{sum(c[4] for c in changed):>+14}"
            )
            print()
            print(
                "Balances fall for students who received discounts under the old, "
                "inverted formula. Have the accountant sign this off before --apply."
            )
        else:
            print("No balance changes.")

        # Reconciliation invariant ---------------------------------------
        alloc_total = (
            await db.execute(
                select(func.coalesce(func.sum(Allocation.amount), ZERO)).filter(
                    Allocation.reversed_by_entry_id.is_(None)
                )
            )
        ).scalar() or ZERO
        over_allocated = await db.execute(
            select(Charge.id)
            .join(Allocation, Allocation.charge_id == Charge.id)
            .filter(Allocation.reversed_by_entry_id.is_(None))
            .group_by(Charge.id, Charge.amount)
            .having(func.sum(Allocation.amount) > Charge.amount)
        )
        broken = list(over_allocated.scalars().all())
        print()
        print(f"Allocated total: {alloc_total}")
        if broken:
            print(f"INVARIANT VIOLATION: charges allocated beyond their amount: {broken}", file=sys.stderr)
            await db.rollback()
            return 3
        print("Invariant OK: no charge is allocated beyond its amount.")

        if apply:
            await db.commit()
            print("\nCommitted.")
        else:
            await db.rollback()
            print("\nRolled back (dry run). Re-run with --apply to commit.")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit the backfill. Without this flag the script rolls back and only reports.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(apply=args.apply)))


if __name__ == "__main__":
    main()
