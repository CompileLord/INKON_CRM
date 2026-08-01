import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


@pytest.mark.asyncio
async def test_journal_operations(client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create Course and enroll student
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Django API",
            "description": "Backend course",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "18:00:00",
                    "time_end": "20:00:00"
                }
            ]
        },
        headers=admin_headers
    )
    course_id = course_resp.json()["id"]

    enroll_resp = await client.post(
        "/api/v1/enrollments/",
        json={
            "student_id": test_student.id,
            "course_id": course_id
        },
        headers=admin_headers
    )
    assert enroll_resp.status_code == 201

    # Get the generated journals
    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journals = list(journals_res.scalars().all())
        assert len(journals) == 5
        journal_id = journals[0].id

    # 2. Get Journal as Mentor
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}

    get_resp = await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)
    assert get_resp.status_code == 200
    grid = get_resp.json()
    assert grid["journal_id"] == journal_id
    assert len(grid["students"]) == 1
    student_record = grid["students"][0]
    assert student_record["student_id"] == test_student.id
    assert len(student_record["entries"]) == 1 # 1 Monday per week
    entry_val = student_record["entries"][0]

    # 3. Batch Update entries (success)
    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry_val["lesson_date"]),
                "attendance": True,
                "score": 4,
                "comment": "Good job",
                "version": entry_val["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200

    # 4. Verify score saved and sum recalculated
    get_resp2 = await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)
    summary_data = get_resp2.json()["students"][0]["summary"]
    assert summary_data["sum_score"] == 4
    assert summary_data["attendance_count"] == 1

    # 5. Batch Update with score=6 -> verify 400
    put_invalid_score = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry_val["lesson_date"]),
                "attendance": True,
                "score": 6,
                "comment": "Invalid",
                "version": entry_val["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_invalid_score.status_code == 422 # Pydantic validation handles ge/le range

    # 6. Check concurrent write conflict on entries -> verify 409
    put_conflict = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry_val["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Conflict test",
                "version": entry_val["version"] # Outdated version, database now has version 2
            }
        ],
        headers=mentor_headers
    )
    assert put_conflict.status_code == 409

    # 7. Check non-owner mentor access -> verify 403
    other_mentor = User(
        email="mentorother@example.com",
        first_name="Mentor",
        last_name="Other",
        role="mentor",
        must_set_password=False
    )
    db_session.add(other_mentor)
    await db_session.commit()

    other_mentor_token = create_access_token(other_mentor.id, other_mentor.role)
    other_mentor_headers = {"Authorization": f"Bearer {other_mentor_token}"}

    bad_get = await client.get(f"/api/v1/journals/{journal_id}", headers=other_mentor_headers)
    assert bad_get.status_code == 403

    # 8. Update exam & bonus summary (success)
    current_summary_version = summary_data["version"]
    patch_summary_resp = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 100,
            "bonus_score": 50,
            "version": current_summary_version
        },
        headers=mentor_headers
    )
    assert patch_summary_resp.status_code == 200
    patched_summary = patch_summary_resp.json()
    assert patched_summary["exam_score"] == 100
    assert patched_summary["bonus_score"] == 50
    assert patched_summary["sum_score"] == 154 # 4 (daily) + 100 + 50

    # 9. Update summary invalid sum (100 + 401 = 501 > 500) -> verify 400
    patch_invalid_sum = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 401,
            "bonus_score": 100,
            "version": patched_summary["version"]
        },
        headers=mentor_headers
    )
    assert patch_invalid_sum.status_code == 400

    # 10. Update summary concurrent conflict -> verify 409
    patch_conflict = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 200,
            "bonus_score": 50,
            "version": current_summary_version # outdated version
        },
        headers=mentor_headers
    )
    assert patch_conflict.status_code == 409
