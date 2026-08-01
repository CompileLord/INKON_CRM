import pytest
from datetime import datetime, date, timezone
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


@pytest.mark.asyncio
async def test_payment_registration_and_discounts(client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, db_session: AsyncSession) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create student
    student_resp = await client.post(
        "/api/v1/users/",
        json={
            "email": "stud1@example.com",
            "first_name": "S",
            "last_name": "One",
            "role": "student",
            "payment_day_of_month": 10
        },
        headers=admin_headers
    )
    student_id = student_resp.json()["id"]

    # Create Course
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "SQL Basics",
            "description": "SQL basics course",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "500.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=admin_headers
    )
    course_id = course_resp.json()["id"]

    # Enroll student
    await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": student_id,
            "course_id": course_id
        },
        headers=admin_headers
    )

    # 4. Accountant registers payment with discount = 10 -> verify effective amount is 90% of amount
    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    payment_resp = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "200.00",
            "paid_at": "2026-07-12T10:00:00Z",
            "method": "transfer",
            "discount_percent": 10,
            "comment": "Initial payment"
        },
        headers=acc_headers
    )
    assert payment_resp.status_code == 201
    pay_data = payment_resp.json()
    assert float(pay_data["effective_amount"]) == 180.0
    assert pay_data["accepted_by_id"] == test_accountant.id

    # 5. Invalid discount = 101 -> verify 422
    pay_invalid_disc = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "200.00",
            "paid_at": "2026-07-12T10:00:00Z",
            "method": "transfer",
            "discount_percent": 101
        },
        headers=acc_headers
    )
    assert pay_invalid_disc.status_code == 422

    # 6. Invalid amount = 0 -> verify 422
    pay_zero_amt = await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": student_id,
            "course_id": course_id,
            "amount": "0.00",
            "paid_at": "2026-07-12T10:00:00Z",
            "method": "cash"
        },
        headers=acc_headers
    )
    assert pay_zero_amt.status_code == 422

    # 7. Check debts list: price 500, effective paid 180, so debt is 320
    debt_resp = await client.get("/api/v1/finance/debts/", headers=acc_headers)
    assert debt_resp.status_code == 200
    debts = debt_resp.json()["items"]
    assert len(debts) == 1
    debt_item = debts[0]
    assert debt_item["student"]["id"] == student_id
    assert float(debt_item["debt"]) == 320.0
    assert float(debt_item["total_paid"]) == 180.0
    assert debt_item["overdue_days"] >= 0

    # 8. Test analytics endpoint
    analytics_resp = await client.get("/api/v1/finance/analytics/", headers=acc_headers)
    assert analytics_resp.status_code == 200
    analytics_data = analytics_resp.json()
    assert analytics_data["total_receivable"] == 500.0
    assert analytics_data["total_collected"] == 180.0
    assert analytics_data["unpaid_students_count"] == 1
    assert len(analytics_data["debtors_preview"]) == 1
    assert analytics_data["debtors_preview"][0]["student_id"] == student_id
    assert analytics_data["debtors_preview"][0]["debt"] == 320.0
