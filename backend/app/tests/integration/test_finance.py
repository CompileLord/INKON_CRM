import pytest
from decimal import Decimal
from datetime import datetime, date, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import Course


@pytest.mark.asyncio
async def test_payment_schedule_assignment(client: AsyncClient, test_admin: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Try to set payment_day_of_month for mentor -> verify 400
    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "mentor_sched@example.com",
            "first_name": "John",
            "last_name": "Doe",
            "role": "mentor",
            "payment_day_of_month": 15
        },
        headers=headers
    )
    assert response.status_code == 400

    # 2. Assign payment day 29 to student -> verify 422
    response2 = await client.post(
        "/api/v1/users/",
        json={
            "email": "student_sched@example.com",
            "first_name": "Jane",
            "last_name": "Doe",
            "role": "student",
            "payment_day_of_month": 29
        },
        headers=headers
    )
    assert response2.status_code == 422

    # 3. Assign payment day 15 to student -> verify 201
    response3 = await client.post(
        "/api/v1/users/",
        json={
            "email": "student_sched@example.com",
            "first_name": "Jane",
            "last_name": "Doe",
            "role": "student",
            "payment_day_of_month": 15
        },
        headers=headers
    )
    assert response3.status_code == 201


async def _setup_student_course(
    client: AsyncClient,
    admin_headers: dict,
    mentor_id: int,
    *,
    email: str,
    price: str = "500.00",
    payment_day: int = 1,
) -> tuple[int, int]:
    """Create a student + course + enrollment.

    ``payment_day=1`` makes the first installment fall due on the enrollment
    date, so billed-to-date assertions hold whatever day the suite runs.
    """
    student_resp = await client.post(
        "/api/v1/users/",
        json={
            "email": email,
            "first_name": "S",
            "last_name": "One",
            "role": "student",
            "payment_day_of_month": payment_day,
        },
        headers=admin_headers,
    )
    assert student_resp.status_code == 201
    student_id = student_resp.json()["id"]

    today = date.today()
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "SQL Basics",
            "description": "SQL basics course",
            "start_date": today.replace(day=1).isoformat(),
            "end_date": (today.replace(day=28) + timedelta(days=40)).isoformat(),
            "exam_type": "weekly",
            "price": price,
            "mentor_id": mentor_id,
            "schedules": [
                {"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}
            ],
        },
        headers=admin_headers,
    )
    assert course_resp.status_code == 201
    course_id = course_resp.json()["id"]

    enroll_resp = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student_id, "course_id": course_id},
        headers=admin_headers,
    )
    assert enroll_resp.status_code == 201
    return student_id, course_id


@pytest.mark.asyncio
async def test_schedule_sums_to_contract_price(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    """Installments must reconcile to the contracted price to the cent."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    # 1000 / 3 does not divide evenly — the remainder must land somewhere.
    student_id, _ = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="sched@example.com", price="1000.00"
    )

    charges_resp = await client.get(
        f"/api/v1/finance/charges/?student_id={student_id}", headers=acc_headers
    )
    assert charges_resp.status_code == 200
    charges = charges_resp.json()["items"]
    assert len(charges) >= 1
    assert sum(Decimal(c["amount"]) for c in charges) == Decimal("1000.00")


@pytest.mark.asyncio
async def test_payment_is_cash_and_discount_is_separate(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    """A discount must reduce the debt, never the credit for cash received."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="stud1@example.com", price="500.00"
    )

    balance_before = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    billed = Decimal(balance_before["billed_to_date"])
    assert billed > 0, "first installment should be due on the enrollment date"

    # discount_percent no longer exists on a payment — it must be rejected.
    rejected = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "200.00",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": "transfer",
            "discount_percent": 10,
        },
        headers=acc_headers,
    )
    assert rejected.status_code == 422

    payment_resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "100.00",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": "transfer",
            "comment": "Initial payment",
        },
        headers=acc_headers,
    )
    assert payment_resp.status_code == 201
    payment = payment_resp.json()
    # Cash received is credited in full — no discount haircut.
    assert Decimal(payment["amount"]) == Decimal("100.00")
    assert Decimal(payment["allocated_amount"]) == Decimal("100.00")
    assert payment["recorded_by_id"] == test_accountant.id
    assert payment["allocations"][0]["course_id"] == course_id

    after_payment = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    assert Decimal(after_payment["net_receivable"]) == billed - Decimal("100.00")

    # A 50 discount reduces the debt by exactly 50.
    discount_resp = await client.post(
        "/api/v1/finance/discounts/",
        json={"student_id": student_id, "amount": "20.00", "reason_code": "SOCIAL"},
        headers=acc_headers,
    )
    assert discount_resp.status_code == 201

    after_discount = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    assert Decimal(after_discount["net_receivable"]) == billed - Decimal("120.00")


@pytest.mark.asyncio
async def test_partial_discount_does_not_settle_whole_charge(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    """Regression: a small discount used to mark an entire charge settled."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, _ = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="partial@example.com", price="500.00"
    )

    balance_before = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    billed = Decimal(balance_before["billed_to_date"])

    discount_resp = await client.post(
        "/api/v1/finance/discounts/",
        json={"student_id": student_id, "amount": "10.00", "reason_code": "GOODWILL"},
        headers=acc_headers,
    )
    assert discount_resp.status_code == 201

    after = (
        await client.get(f"/api/v1/finance/students/{student_id}/balance", headers=acc_headers)
    ).json()
    assert Decimal(after["net_receivable"]) == billed - Decimal("10.00")

    charges = (
        await client.get(f"/api/v1/finance/charges/?student_id={student_id}", headers=acc_headers)
    ).json()["items"]
    first_charge = charges[0]
    assert first_charge["status"] == "open", "a partial discount must not settle the charge"
    assert Decimal(first_charge["remaining_balance"]) == Decimal(first_charge["amount"]) - Decimal("10.00")


@pytest.mark.asyncio
async def test_debts_and_analytics_use_billed_not_contract(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="debts@example.com", price="500.00"
    )

    await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "100.00",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": "cash",
        },
        headers=acc_headers,
    )

    debts = (await client.get("/api/v1/finance/debts/", headers=acc_headers)).json()["items"]
    item = next(d for d in debts if d["student"]["id"] == student_id)
    assert item["student"]["id"] == student_id
    # Debt is billed-to-date less settled, never the whole contract.
    assert Decimal(item["debt"]) == Decimal(item["billed_to_date"]) - Decimal(item["total_paid"])
    assert Decimal(item["debt"]) < Decimal(item["price_at_enrollment"])
    assert item["overdue_days"] >= 0

    analytics = (await client.get("/api/v1/finance/analytics/", headers=acc_headers)).json()
    assert Decimal(analytics["gross_contract_value"]) >= Decimal("500.00")
    # net_receivable excludes charges that have not yet come due.
    assert Decimal(analytics["net_receivable"]) >= Decimal(item["debt"])
    assert Decimal(analytics["collected_in_period"]) >= Decimal("100.00")
    assert analytics["unpaid_students_count"] >= 1
    assert Decimal(analytics["billed_in_period"]) > 0
    assert 0 <= Decimal(analytics["collection_rate"]) <= 1


@pytest.mark.asyncio
async def test_payment_filters_are_real(
    client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User
) -> None:
    """Regression: course_id was echoed into results but never filtered on."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    acc_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    student_id, course_id = await _setup_student_course(
        client, admin_headers, test_mentor.id, email="filters@example.com", price="500.00"
    )

    await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "100.00",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "method": "cash",
        },
        headers=acc_headers,
    )

    matching = (
        await client.get(f"/api/v1/finance/payments/?course_id={course_id}", headers=acc_headers)
    ).json()
    assert matching["total"] == 1
    assert matching["items"][0]["allocations"][0]["course_id"] == course_id

    # A course the payment never touched must return nothing, not a relabelled row.
    other = (
        await client.get(f"/api/v1/finance/payments/?course_id={course_id + 999}", headers=acc_headers)
    ).json()
    assert other["total"] == 0

    by_method = (
        await client.get("/api/v1/finance/payments/?method=transfer", headers=acc_headers)
    ).json()
    assert by_method["total"] == 0
