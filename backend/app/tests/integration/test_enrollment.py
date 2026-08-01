import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


@pytest.mark.asyncio
async def test_enroll_student_success(client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession) -> None:
    # 1. Create a course first
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    course_response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "React JS",
            "description": "Frontend framework",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "200.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=headers
    )
    assert course_response.status_code == 201
    course_id = course_response.json()["id"]

    # 2. Enroll student
    response = await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": test_student.id,
            "course_id": course_id
        },
        headers=headers
    )
    assert response.status_code == 201
    enrollment_data = response.json()
    assert enrollment_data["status"] == "active"
    assert float(enrollment_data["price_at_enrollment"]) == 200.0
    assert enrollment_data["color_hex"] == "#FF5733" # First color in palette

    # 3. Check JournalEntries and summaries in DB
    async with db_session.begin():
        entries_result = await db_session.execute(
            select(JournalEntry).filter(JournalEntry.student_id == test_student.id)
        )
        entries = list(entries_result.scalars().all())
        assert len(entries) == 5 # 5 Mondays in August 2026

        summaries_result = await db_session.execute(
            select(JournalStudentSummary).filter(JournalStudentSummary.student_id == test_student.id)
        )
        summaries = list(summaries_result.scalars().all())
        assert len(summaries) == 5 # 5 weekly journals

    # 4. Enroll duplicate -> verify 409
    dup_response = await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": test_student.id,
            "course_id": course_id
        },
        headers=headers
    )
    assert dup_response.status_code == 409

    # 5. Withdraw student
    withdraw_response = await client.patch(
        f"/api/v1/enrollments/{enrollment_data['id']}/withdraw",
        headers=headers
    )
    assert withdraw_response.status_code == 200
    assert withdraw_response.json()["status"] == "withdrawn"


@pytest.mark.asyncio
async def test_enroll_student_unauthorized(client: AsyncClient, test_student: User, test_mentor: User) -> None:
    token = create_access_token(test_student.id, test_student.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": test_student.id,
            "course_id": 1
        },
        headers=headers
    )
    assert response.status_code == 403
