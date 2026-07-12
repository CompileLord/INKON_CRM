import pytest
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_audit_logs_workflow(client: AsyncClient, test_admin: User, test_accountant: User, test_mentor: User, test_student: User) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create another mentor to reassign
    mentor_resp = await client.post(
        "/api/v1/users/",
        json={
            "email": "mentor_audit@example.com",
            "first_name": "New",
            "last_name": "Mentor",
            "role": "mentor"
        },
        headers=admin_headers
    )
    new_mentor_id = mentor_resp.json()["id"]

    # 1. Create a course and update its mentor
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Science 101",
            "description": "Science 101 course",
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "14:00:00",
                    "time_end": "16:00:00"
                }
            ]
        },
        headers=admin_headers
    )
    course_id = course_resp.json()["id"]

    # Patch mentor
    patch_resp = await client.patch(
        f"/api/v1/courses/{course_id}",
        json={"mentor_id": new_mentor_id},
        headers=admin_headers
    )
    assert patch_resp.status_code == 200

    # 2. Register payment with discount
    # Enroll student first
    await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": test_student.id,
            "course_id": course_id
        },
        headers=admin_headers
    )

    acc_token = create_access_token(test_accountant.id, test_accountant.role)
    acc_headers = {"Authorization": f"Bearer {acc_token}"}

    await client.post(
        "/api/v1/finance/payments/",
        json={
            "student_id": test_student.id,
            "course_id": course_id,
            "amount": "100.00",
            "paid_at": "2026-07-12T12:00:00Z",
            "method": "cash",
            "discount_percent": 15
        },
        headers=acc_headers
    )

    # 3. Retrieve audit logs as SuperAdmin
    logs_resp = await client.get("/api/v1/audit-log/", headers=admin_headers)
    assert logs_resp.status_code == 200
    logs = logs_resp.json()["items"]
    assert len(logs) >= 2

    # Check for mentor change log
    course_log = [l for l in logs if l["entity_type"] == "course"]
    assert len(course_log) > 0
    assert course_log[0]["field_name"] == "mentor_id"

    # Check for payment discount log
    payment_log = [l for l in logs if l["entity_type"] == "payment"]
    assert len(payment_log) > 0
    assert payment_log[0]["field_name"] == "discount_percent"

    # 4. Attempt retrieve as Mentor -> verify 403
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}
    logs_resp_m = await client.get("/api/v1/audit-log/", headers=mentor_headers)
    assert logs_resp_m.status_code == 403
