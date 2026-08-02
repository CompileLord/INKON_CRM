import pytest
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.charge import Charge, ChargeStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.allocation import Allocation
from app.models.accounting_period import AccountingPeriod, AccountingPeriodStatus


@pytest.mark.asyncio
async def test_schedule_generation_and_auto_allocation(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    # 1. Create student with payment_day = 15
    st_resp = await client.post(
        "/api/v1/users/",
        json={
            "email": "sched_stud@example.com",
            "first_name": "Sched",
            "last_name": "Student",
            "role": "student",
            "payment_day_of_month": 15,
        },
        headers=admin_headers,
    )
    student_id = st_resp.json()["id"]

    # 2. Create 3-month Course (Price 1000)
    c_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Full Stack Dev",
            "description": "3-month course",
            "start_date": "2026-08-01",
            "end_date": "2026-10-31",
            "exam_type": "monthly",
            "price": "1000.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
        },
        headers=admin_headers,
    )
    course_id = c_resp.json()["id"]

    # 3. Enroll student
    enr_resp = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )
    enrollment_id = enr_resp.json()["id"]

    # 4. Verify 3 charges generated summing to exactly 1000.00
    ch_q = select(Charge).filter(Charge.enrollment_id == enrollment_id).order_by(Charge.sequence_no.asc())
    ch_res = await db_session.execute(ch_q)
    charges = list(ch_res.scalars().all())

    assert len(charges) == 3
    # 1000 / 3 = 333.33, 333.33, 333.34
    assert charges[0].amount == Decimal("333.33")
    assert charges[1].amount == Decimal("333.33")
    assert charges[2].amount == Decimal("333.34")
    assert sum(c.amount for c in charges) == Decimal("1000.00")

    # 5. Overpay: Record payment of 500
    pmt_resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "500.00",
            "paid_at": "2026-08-05T10:00:00Z",
            "method": "cash",
            "comment": "Overpayment for charge 1",
        },
        headers=acc_headers,
    )
    assert pmt_resp.status_code == 201

    # Check student balance
    bal_resp = await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    assert bal_resp.status_code == 200
    bal_data = bal_resp.json()

    # Surplus 166.67 is auto-allocated to next charge (charge 2), leaving credit_balance = 0.0 and net_receivable = 0.0
    assert float(bal_data["credit_balance"]) == 0.0
    assert float(bal_data["net_receivable"]) == 0.0


@pytest.mark.asyncio
async def test_void_and_refund_lifecycle(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    # Setup student + course + enrollment
    st_resp = await client.post(
        "/api/v1/users/",
        json={"email": "lifecycle_st@example.com", "first_name": "L", "last_name": "C", "role": "student"},
        headers=admin_headers,
    )
    student_id = st_resp.json()["id"]

    c_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Pro",
            "description": "Python course",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "600.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 2, "time_start": "14:00:00", "time_end": "16:00:00"}],
        },
        headers=admin_headers,
    )
    course_id = c_resp.json()["id"]

    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )

    # 1. Post payment
    pmt_resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "600.00",
            "paid_at": "2026-08-02T10:00:00Z",
            "method": "transfer",
        },
        headers=acc_headers,
    )
    assert pmt_resp.status_code == 201

    # Fetch payment entry id
    payment_q = select(LedgerEntry).filter(LedgerEntry.student_id == student_id, LedgerEntry.type == LedgerEntryType.PAYMENT)
    p_res = await db_session.execute(payment_q)
    payment_entry = p_res.scalars().first()

    # 2. Refund as Accountant -> expect 403 Forbidden (SuperAdmin only!)
    refund_acc = await client.post(
        f"/api/v1/finance/payments/{payment_entry.id}/refund",
        json={"amount": "200.00", "reason_code": "CUSTOMER_REQ"},
        headers=acc_headers,
    )
    assert refund_acc.status_code == 403

    # 3. Refund as SuperAdmin -> expect 200
    refund_admin = await client.post(
        f"/api/v1/finance/payments/{payment_entry.id}/refund",
        json={"amount": "200.00", "to_wallet": False, "reason_code": "CUSTOMER_REQ"},
        headers=admin_headers,
    )
    assert refund_admin.status_code == 200

    # 4. A refunded payment can no longer be voided — the two would
    #    double-count the reversal.
    void_refunded = await client.post(
        f"/api/v1/finance/payments/{payment_entry.id}/void",
        json={"reason_code": "TYPO_ENTRY"},
        headers=acc_headers,
    )
    assert void_refunded.status_code == 400

    # The cash-out refund reopened 200 of the settled charges.
    bal_resp = await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    assert float(bal_resp.json()["net_receivable"]) == 200.0

    # 5. A separate, untouched payment voids cleanly and restores the debt.
    second = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "200.00",
            "paid_at": "2026-08-03T10:00:00Z",
            "method": "cash",
        },
        headers=acc_headers,
    )
    assert second.status_code == 201
    second_id = second.json()["id"]

    bal_after_second = await client.get(
        f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers
    )
    assert float(bal_after_second.json()["net_receivable"]) == 0.0

    void_resp = await client.post(
        f"/api/v1/finance/payments/{second_id}/void",
        json={"reason_code": "TYPO_ENTRY"},
        headers=acc_headers,
    )
    assert void_resp.status_code == 200

    bal_final = await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    assert float(bal_final.json()["net_receivable"]) == 200.0


@pytest.mark.asyncio
async def test_period_close_enforcement(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    # 1. Close period 2026-07 as SuperAdmin
    close_resp = await client.post(
        "/api/v1/finance/periods/2026/7/close",
        json={"comment": "Monthly close"},
        headers=admin_headers,
    )
    assert close_resp.status_code == 200

    # 2. Attempt to post payment into closed period (2026-07) -> expect 400
    st_resp = await client.post(
        "/api/v1/users/",
        json={"email": "period_st@example.com", "first_name": "P", "last_name": "S", "role": "student"},
        headers=admin_headers,
    )
    student_id = st_resp.json()["id"]

    c_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Period Course",
            "description": "Course",
            "start_date": "2026-07-01",
            "end_date": "2026-07-31",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}],
        },
        headers=admin_headers,
    )
    course_id = c_resp.json()["id"]

    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )

    pmt_resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "300.00",
            "paid_at": "2026-07-15T10:00:00Z",
            "method": "cash",
        },
        headers=acc_headers,
    )
    assert pmt_resp.status_code == 400
    assert "closed" in pmt_resp.json()["detail"].lower()

    # 3. Reopen period as SuperAdmin
    reopen_resp = await client.post(
        "/api/v1/finance/periods/2026/7/reopen",
        json={"reason_code": "CORRECTING_JULY_ENTRIES"},
        headers=admin_headers,
    )
    assert reopen_resp.status_code == 200

    # 4. Now payment succeeds
    pmt_resp2 = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "300.00",
            "paid_at": "2026-07-15T10:00:00Z",
            "method": "cash",
        },
        headers=acc_headers,
    )
    assert pmt_resp2.status_code == 201


@pytest.mark.asyncio
async def test_receipt_generation(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    st_resp = await client.post(
        "/api/v1/users/",
        json={"email": "receipt_st@example.com", "first_name": "Alice", "last_name": "Smith", "role": "student"},
        headers=admin_headers,
    )
    student_id = st_resp.json()["id"]

    c_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Design Course",
            "description": "UI UX",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "400.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 3, "time_start": "10:00:00", "time_end": "12:00:00"}],
        },
        headers=admin_headers,
    )
    course_id = c_resp.json()["id"]

    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )

    # Post payment
    await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "400.00",
            "paid_at": "2026-08-05T10:00:00Z",
            "method": "cash",
            "comment": "Tuition fee payment",
        },
        headers=acc_headers,
    )

    payment_q = select(LedgerEntry).filter(LedgerEntry.student_id == student_id, LedgerEntry.type == LedgerEntryType.PAYMENT)
    p_res = await db_session.execute(payment_q)
    payment_entry = p_res.scalars().first()

    # Get receipt
    receipt_resp = await client.get(f"/api/v1/finance/payments/{payment_entry.id}/receipt", headers=acc_headers)
    assert receipt_resp.status_code == 200
    r_data = receipt_resp.json()
    assert r_data["receipt_number"].startswith("REC-")
    assert r_data["student_name"] == "Alice Smith"
    assert float(r_data["amount"]) == 400.0
