import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import CourseExamType
from app.models.journal import Journal
from app.core.scoring import default_exam_max_score, max_period_score, MAX_BONUS_SCORE


from journal_test_support import _create_course


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
