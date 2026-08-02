"""Reconciliation invariants for the charge/credit ledger.

Phase 9 of FINANCE_REDESIGN_PLAN.md. These assert the properties the whole
architecture rests on: balances always reconcile to the ledger, reversals are
exact round-trips, and nothing is ever destroyed.
"""

import pytest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.user import User


async def _setup(client: AsyncClient, admin_headers: dict, mentor_id: int, email: str, price: str = "600.00"):
    student = await client.post(
        "/api/v1/users/",
        json={
            "email": email,
            "first_name": "Inv",
            "last_name": "Ariant",
            "role": "student",
            "payment_day_of_month": 1,
        },
        headers=admin_headers,
    )
    assert student.status_code == 201
    student_id = student.json()["id"]

    today = date.today()
    course = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Invariants",
            "description": "Course",
            "start_date": today.replace(day=1).isoformat(),
            "end_date": (today.replace(day=28) + timedelta(days=40)).isoformat(),
            "exam_type": "weekly",
            "price": price,
            "mentor_id": mentor_id,
            "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
        },
        headers=admin_headers,
    )
    assert course.status_code == 201
    course_id = course.json()["id"]

    enroll = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )
    assert enroll.status_code == 201
    return student_id, course_id


async def _assert_no_charge_over_allocated(db: AsyncSession) -> None:
    """No charge may ever be settled beyond its own amount."""
    rows = await db.execute(
        select(Charge.id, Charge.amount, func.coalesce(func.sum(Allocation.amount), 0))
        .outerjoin(
            Allocation,
            (Allocation.charge_id == Charge.id) & (Allocation.reversed_by_entry_id.is_(None)),
        )
        .group_by(Charge.id, Charge.amount)
    )
    for charge_id, amount, allocated in rows.all():
        assert Decimal(allocated or 0) <= Decimal(amount), f"charge {charge_id} over-allocated"


async def _pay(client, acc_headers, student_id, course_id, amount, method="cash"):
    resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": amount,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": method,
        },
        headers=acc_headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.asyncio
async def test_void_is_an_exact_round_trip(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "roundtrip@example.com")

    before = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()

    payment = await _pay(client, acc_headers, student_id, course_id, "150.00")

    void = await client.post(
        f"/api/v1/finance/payments/{payment['id']}/void",
        json={"reason_code": "TYPO"},
        headers=acc_headers,
    )
    assert void.status_code == 200

    after = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()

    assert Decimal(after["net_receivable"]) == Decimal(before["net_receivable"])
    assert Decimal(after["total_settled"]) == Decimal(before["total_settled"])
    assert Decimal(after["credit_balance"]) == Decimal(before["credit_balance"])
    await _assert_no_charge_over_allocated(db_session)


@pytest.mark.asyncio
async def test_void_preserves_allocation_history(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """Reversal must stamp rows, never delete them — the ledger is append-only."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "history@example.com")
    payment = await _pay(client, acc_headers, student_id, course_id, "150.00")

    before_count = (
        await db_session.execute(
            select(func.count()).select_from(Allocation).filter(Allocation.ledger_entry_id == payment["id"])
        )
    ).scalar()
    assert before_count > 0

    await client.post(
        f"/api/v1/finance/payments/{payment['id']}/void",
        json={"reason_code": "TYPO"},
        headers=acc_headers,
    )

    after_count = (
        await db_session.execute(
            select(func.count()).select_from(Allocation).filter(Allocation.ledger_entry_id == payment["id"])
        )
    ).scalar()
    assert after_count >= before_count, "allocations must not be deleted"

    reversed_rows = (
        await db_session.execute(
            select(func.count())
            .select_from(Allocation)
            .filter(
                Allocation.ledger_entry_id == payment["id"],
                Allocation.reversed_by_entry_id.isnot(None),
            )
        )
    ).scalar()
    assert reversed_rows > 0, "reversal must be recorded on the allocation rows"

    # The original payment entry itself is untouched.
    entry = (
        await db_session.execute(select(LedgerEntry).filter(LedgerEntry.id == payment["id"]))
    ).scalars().first()
    assert entry is not None
    assert entry.amount == Decimal("150.00")


@pytest.mark.asyncio
async def test_wallet_refund_increases_wallet_cash_refund_does_not(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """Regression: a wallet refund used to *reduce* the student's credit."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "wallet@example.com")
    payment = await _pay(client, acc_headers, student_id, course_id, "200.00")

    wallet_before = Decimal(
        (await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers))
        .json()["credit_balance"]
    )

    refund = await client.post(
        f"/api/v1/finance/payments/{payment['id']}/refund",
        json={"amount": "50.00", "to_wallet": True, "reason_code": "REALLOCATE"},
        headers=admin_headers,
    )
    assert refund.status_code == 200

    wallet_after = Decimal(
        (await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers))
        .json()["credit_balance"]
    )
    assert wallet_after == wallet_before + Decimal("50.00"), "wallet refund must retain the money"

    # A cash-out refund takes money out of the building: credit must not rise.
    cash_refund = await client.post(
        f"/api/v1/finance/payments/{payment['id']}/refund",
        json={"amount": "50.00", "to_wallet": False, "reason_code": "CUSTOMER_REQ"},
        headers=admin_headers,
    )
    assert cash_refund.status_code == 200

    wallet_final = Decimal(
        (await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers))
        .json()["credit_balance"]
    )
    assert wallet_final == wallet_after, "cash-out must not add wallet credit"
    await _assert_no_charge_over_allocated(db_session)


@pytest.mark.asyncio
async def test_overpayment_becomes_visible_credit(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """Overpayment must surface as credit, not vanish from every report."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "over@example.com", price="300.00")

    await _pay(client, acc_headers, student_id, course_id, "500.00")

    balance = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    assert Decimal(balance["net_receivable"]) == Decimal("0.00")
    assert Decimal(balance["credit_balance"]) == Decimal("200.00")

    credits = (await client.get("/api/v1/finance/credits/", headers=acc_headers)).json()
    mine = [c for c in credits if c["student_id"] == student_id]
    assert len(mine) == 1
    assert Decimal(mine[0]["credit_balance"]) == Decimal("200.00")

    analytics = (await client.get("/api/v1/finance/analytics/", headers=acc_headers)).json()
    assert Decimal(analytics["outstanding_credit"]) >= Decimal("200.00")
    await _assert_no_charge_over_allocated(db_session)


@pytest.mark.asyncio
async def test_manual_allocation_applies_wallet_credit(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "manual@example.com", price="600.00")
    payment = await _pay(client, acc_headers, student_id, course_id, "200.00")

    # Free the money back into the wallet.
    await client.post(
        f"/api/v1/finance/payments/{payment['id']}/refund",
        json={"amount": "200.00", "to_wallet": True, "reason_code": "REALLOCATE"},
        headers=admin_headers,
    )

    charges = (
        await client.get(f"/api/v1/finance/charges/?student_id={student_id}", headers=acc_headers)
    ).json()["items"]
    target = charges[-1]

    alloc = await client.post(
        "/api/v1/finance/allocations/",
        json={"student_id": student_id, "charge_id": target["id"], "amount": "50.00"},
        headers=acc_headers,
    )
    assert alloc.status_code == 201

    refreshed = (
        await client.get(f"/api/v1/finance/charges/?student_id={student_id}", headers=acc_headers)
    ).json()["items"]
    updated = [c for c in refreshed if c["id"] == target["id"]][0]
    assert Decimal(updated["allocated_amount"]) == Decimal("50.00")

    # Over-allocating beyond available credit is refused.
    too_much = await client.post(
        "/api/v1/finance/allocations/",
        json={"student_id": student_id, "charge_id": target["id"], "amount": "100000.00"},
        headers=acc_headers,
    )
    assert too_much.status_code == 400
    await _assert_no_charge_over_allocated(db_session)


@pytest.mark.asyncio
async def test_closed_period_blocks_reversal_of_entries_inside_it(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """Voiding inside a closed month would silently restate that month."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "closed@example.com")
    payment = await _pay(client, acc_headers, student_id, course_id, "100.00")

    today = date.today()
    close = await client.post(
        f"/api/v1/finance/periods/{today.year}/{today.month}/close", json={}, headers=admin_headers
    )
    assert close.status_code == 200

    blocked = await client.post(
        f"/api/v1/finance/payments/{payment['id']}/void",
        json={"reason_code": "TYPO"},
        headers=acc_headers,
    )
    assert blocked.status_code == 400

    # An adjustment is the sanctioned correction, but it too respects the lock.
    adjustment = await client.post(
        "/api/v1/finance/adjustments/",
        json={"student_id": student_id, "amount": "10.00", "reason_code": "CORRECTION"},
        headers=admin_headers,
    )
    assert adjustment.status_code == 400

    reopen = await client.post(
        f"/api/v1/finance/periods/{today.year}/{today.month}/reopen",
        json={"reason_code": "AUDIT_FIX"},
        headers=admin_headers,
    )
    assert reopen.status_code == 200
    assert reopen.json()["closed_at"] is None
    assert reopen.json()["closed_by_id"] is None

    now_allowed = await client.post(
        f"/api/v1/finance/payments/{payment['id']}/void",
        json={"reason_code": "TYPO"},
        headers=acc_headers,
    )
    assert now_allowed.status_code == 200


@pytest.mark.asyncio
async def test_debts_endpoint_performs_no_writes(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """GET /debts/ used to generate schedules — a read must stay a read."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, _ = await _setup(client, admin_headers, test_mentor.id, "readonly@example.com")

    async def counts():
        charges = (await db_session.execute(select(func.count()).select_from(Charge))).scalar()
        entries = (await db_session.execute(select(func.count()).select_from(LedgerEntry))).scalar()
        allocs = (await db_session.execute(select(func.count()).select_from(Allocation))).scalar()
        return charges, entries, allocs

    before = await counts()
    for _ in range(3):
        resp = await client.get("/api/v1/finance/debts/", headers=acc_headers)
        assert resp.status_code == 200
        assert (await client.get("/api/v1/finance/analytics/", headers=acc_headers)).status_code == 200
    after = await counts()

    assert before == after, "read endpoints must not mutate the ledger"


@pytest.mark.asyncio
async def test_aging_buckets_reconcile_to_net_receivable(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup(client, admin_headers, test_mentor.id, "aging@example.com", price="600.00")
    await _pay(client, acc_headers, student_id, course_id, "50.00")

    analytics = (await client.get("/api/v1/finance/analytics/", headers=acc_headers)).json()
    aging = analytics["aging"]
    bucket_total = sum(Decimal(aging[k]) for k in ("d0_30", "d31_60", "d61_90", "d90_plus"))

    assert bucket_total == Decimal(analytics["net_receivable"]), "aging must reconcile to the receivable"


@pytest.mark.asyncio
async def test_discount_cannot_exceed_outstanding_charges(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, _ = await _setup(client, admin_headers, test_mentor.id, "toobig@example.com", price="300.00")

    too_big = await client.post(
        "/api/v1/finance/discounts/",
        json={"student_id": student_id, "amount": "99999.00", "reason_code": "OOPS"},
        headers=acc_headers,
    )
    assert too_big.status_code == 400
    await _assert_no_charge_over_allocated(db_session)
