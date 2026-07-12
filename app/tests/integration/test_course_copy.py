import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_course_copy_flow(client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create 2 students
    s1_resp = await client.post(
        "/api/v1/users/",
        json={"email": "c1@example.com", "first_name": "C", "last_name": "One", "role": "student"},
        headers=admin_headers
    )
    student1_id = s1_resp.json()["id"]

    s2_resp = await client.post(
        "/api/v1/users/",
        json={"email": "c2@example.com", "first_name": "C", "last_name": "Two", "role": "student"},
        headers=admin_headers
    )
    student2_id = s2_resp.json()["id"]

    # 2. Create Course A (source)
    course_a_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Course A",
            "description": "Source course",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "100.00",
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
    course_a_id = course_a_resp.json()["id"]

    # Enroll students in Course A
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student1_id, "course_id": course_a_id},
        headers=admin_headers
    )
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student2_id, "course_id": course_a_id},
        headers=admin_headers
    )

    # 3. Copy Course A to Course B with new details (price 150)
    course_b_resp = await client.post(
        f"/api/v1/courses/{course_a_id}/copy/",
        json={
            "title": "Course B",
            "description": "Copied course",
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
            "exam_type": "monthly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 2,
                    "time_start": "14:00:00",
                    "time_end": "16:00:00"
                }
            ]
        },
        headers=admin_headers
    )
    assert course_b_resp.status_code == 201
    course_b_data = course_b_resp.json()
    course_b_id = course_b_data["id"]
    assert float(course_b_data["price"]) == 150.0

    # 4. Verify student enrollments copied to Course B and frozen at 150.00
    enroll_list_resp = await client.get("/api/v1/enrollments/", headers=admin_headers)
    assert enroll_list_resp.status_code == 200
    enrollments = enroll_list_resp.json()["items"]

    # Filter enrollments for Course B
    b_enrolls = [e for e in enrollments if e["course_id"] == course_b_id]
    assert len(b_enrolls) == 2
    for e in b_enrolls:
        assert float(e["price_at_enrollment"]) == 150.0
        assert e["status"] == "active"

    # 5. Access check: Mentor copy request should fail -> verify 403
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}
    rbac_resp = await client.post(
        f"/api/v1/courses/{course_a_id}/copy/",
        json={
            "title": "Course C",
            "description": "C",
            "start_date": "2026-10-01",
            "end_date": "2026-10-31",
            "exam_type": "weekly",
            "price": "200.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 3,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=mentor_headers
    )
    assert rbac_resp.status_code == 403
