import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import Course, CourseStatus, CourseExamType
from app.models.journal import Journal
from app.core.scoring import default_exam_max_score, max_period_score, score_percentage, MAX_BONUS_SCORE


def test_scoring_rules_unit() -> None:
    assert default_exam_max_score(CourseExamType.WEEKLY) == 70
    assert default_exam_max_score(CourseExamType.MONTHLY) == 60

    max_weekly = max_period_score(total_lessons=5, exam_max_score=70)
    assert max_weekly == 100
    assert score_percentage(100, max_weekly) == 100.0

    max_monthly = max_period_score(total_lessons=12, exam_max_score=60)
    assert max_monthly == 132
    assert score_percentage(66, max_monthly) == 50.0

    assert score_percentage(0, 0) == 0.0


@pytest.mark.asyncio
async def test_journal_operations(client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

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

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journals = list(journals_res.scalars().all())
        assert len(journals) == 5
        journal_id = journals[0].id

    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}

    get_resp = await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)
    assert get_resp.status_code == 200
    grid = get_resp.json()
    assert grid["journal_id"] == journal_id
    assert grid["exam_max_score"] == 70
    assert len(grid["students"]) == 1
    student_record = grid["students"][0]
    assert student_record["student_id"] == test_student.id
    assert len(student_record["entries"]) == 1
    entry_val = student_record["entries"][0]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry_val["lesson_date"]),
                "attendance": False,
                "score": 4,
                "comment": "Good job",
                "version": entry_val["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200

    get_resp2 = await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)
    summary_data = get_resp2.json()["students"][0]["summary"]
    assert summary_data["homework_score"] == 4
    assert summary_data["attendance_score"] == 1
    assert summary_data["attendance_count"] == 1
    assert summary_data["sum_score"] == 5
    assert summary_data["max_period_score"] == 76
    assert summary_data["percentage"] == 6.58

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
    assert put_invalid_score.status_code == 422

    put_conflict = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry_val["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Conflict test",
                "version": entry_val["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_conflict.status_code == 409

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

    current_summary_version = summary_data["version"]
    patch_summary_resp = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 70,
            "bonus_score": 15,
            "version": current_summary_version
        },
        headers=mentor_headers
    )
    assert patch_summary_resp.status_code == 200
    patched_summary = patch_summary_resp.json()
    assert patched_summary["exam_score"] == 70
    assert patched_summary["bonus_score"] == 15
    assert patched_summary["sum_score"] == 90
    assert patched_summary["percentage"] == 118.42

    patch_exceed_exam = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 71,
            "bonus_score": 0,
            "version": patched_summary["version"]
        },
        headers=mentor_headers
    )
    assert patch_exceed_exam.status_code == 400

    patch_exceed_bonus = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 50,
            "bonus_score": 21,
            "version": patched_summary["version"]
        },
        headers=mentor_headers
    )
    assert patch_exceed_bonus.status_code == 400

    patch_conflict = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": 50,
            "bonus_score": 10,
            "version": current_summary_version
        },
        headers=mentor_headers
    )
    assert patch_conflict.status_code == 409

    patch_weight_too_low = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 60},
        headers=mentor_headers
    )
    assert patch_weight_too_low.status_code == 400

    patch_weight_ok = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 80},
        headers=mentor_headers
    )
    assert patch_weight_ok.status_code == 200
    assert patch_weight_ok.json()["exam_max_score"] == 80

    get_resp3 = await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)
    summary_data3 = get_resp3.json()["students"][0]["summary"]
    assert summary_data3["max_period_score"] == 86

    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}
    patch_student_forbidden = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 50},
        headers=student_headers
    )
    assert patch_student_forbidden.status_code == 403

    patch_other_mentor_forbidden = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 50},
        headers=other_mentor_headers
    )
    assert patch_other_mentor_forbidden.status_code == 403

    async with db_session.begin():
        course = await db_session.get(Course, course_id)
        course.status = CourseStatus.ARCHIVED

    patch_archived_forbidden = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 50},
        headers=mentor_headers
    )
    assert patch_archived_forbidden.status_code == 403


async def _create_course(client: AsyncClient, headers: dict, mentor_id: int, exam_type: str) -> int:
    resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": f"Course {exam_type}",
            "description": "Scoring fixture course",
            "start_date": "2026-08-01",
            "end_date": "2026-09-30",
            "exam_type": exam_type,
            "price": "300.00",
            "mentor_id": mentor_id,
            "schedules": [
                {"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"},
                {"day_of_week": 2, "time_start": "18:00:00", "time_end": "20:00:00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_generated_journals_use_exam_weight_of_their_course_type(
    client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession
) -> None:
    """A monthly course must generate journals weighted 60, not the column default 70."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    monthly_id = await _create_course(client, admin_headers, test_mentor.id, "monthly")
    weekly_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")

    async with db_session.begin():
        monthly_res = await db_session.execute(select(Journal).filter(Journal.course_id == monthly_id))
        monthly_journals = list(monthly_res.scalars().all())
        weekly_res = await db_session.execute(select(Journal).filter(Journal.course_id == weekly_id))
        weekly_journals = list(weekly_res.scalars().all())

    assert monthly_journals
    assert weekly_journals
    assert {j.exam_max_score for j in monthly_journals} == {default_exam_max_score(CourseExamType.MONTHLY)}
    assert {j.exam_max_score for j in weekly_journals} == {default_exam_max_score(CourseExamType.WEEKLY)}


@pytest.mark.asyncio
async def test_summary_has_real_maximum_immediately_after_enrollment(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    """Before any journal edit, a summary must already carry its period maximum — never 0/0."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    enroll_resp = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers,
    )
    assert enroll_resp.status_code == 201

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journals = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)
        journal_id = journals[0].id
        exam_weight = journals[0].exam_max_score

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    summary = grid["students"][0]["summary"]

    assert summary["total_lessons"] > 0
    assert summary["sum_score"] == 0
    assert summary["max_period_score"] == max_period_score(summary["total_lessons"], exam_weight)
    assert summary["percentage"] == 0.0


@pytest.mark.asyncio
async def test_rejected_exam_weight_change_mutates_nothing(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    """Lowering the weight below an existing exam score is refused and leaves state untouched."""
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers,
    )

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    summary = grid["students"][0]["summary"]

    exam_resp = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 60, "bonus_score": MAX_BONUS_SCORE, "version": summary["version"]},
        headers=mentor_headers,
    )
    assert exam_resp.status_code == 200

    before = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    before_summary = before["students"][0]["summary"]

    rejected = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"exam_max_score": 50},
        headers=mentor_headers,
    )
    assert rejected.status_code == 400

    after = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    assert after["exam_max_score"] == before["exam_max_score"]
    assert after["students"][0]["summary"] == before_summary
