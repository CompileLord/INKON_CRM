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
    assert patch_weight_ok.json()["journal"]["exam_max_score"] == 80
    assert len(patch_weight_ok.json()["summaries"]) >= 1

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


@pytest.mark.asyncio
async def test_batch_update_partial_conflict(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    student2 = User(email="student2@example.com", first_name="Student", last_name="Two", role="student", must_set_password=False)
    db_session.add(student2)
    await db_session.commit()

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)
    await client.post("/api/v1/enrollments/", json={"student_id": student2.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    s1_entry = grid["students"][0]["entries"][0]
    s2_entry = grid["students"][1]["entries"][0]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": grid["students"][0]["student_id"],
                "lesson_date": str(s1_entry["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Good",
                "version": s1_entry["version"]
            },
            {
                "student_id": grid["students"][1]["student_id"],
                "lesson_date": str(s2_entry["lesson_date"]),
                "attendance": True,
                "score": 4,
                "comment": "Stale version test",
                "version": s2_entry["version"] + 999
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    res = put_resp.json()
    assert len(res["applied"]) == 1
    assert len(res["conflicts"]) == 1
    assert res["conflicts"][0]["submitted_version"] == s2_entry["version"] + 999
    assert res["conflicts"][0]["current"]["version"] == s2_entry["version"]

    get_resp = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    s1_updated = [s for s in get_resp["students"] if s["student_id"] == grid["students"][0]["student_id"]][0]["entries"][0]
    assert s1_updated["score"] == 5


@pytest.mark.asyncio
async def test_batch_update_returns_incremented_versions(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    entry = grid["students"][0]["entries"][0]
    v_initial = entry["version"]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 3,
                "comment": None,
                "version": v_initial
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    res = put_resp.json()
    v_returned = res["applied"][0]["version"]
    assert v_returned == v_initial + 1

    resubmit_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Chained update",
                "version": v_returned
            }
        ],
        headers=mentor_headers
    )
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["applied"][0]["version"] == v_returned + 1


@pytest.mark.asyncio
async def test_batch_update_returns_recalculated_summaries(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    entry = grid["students"][0]["entries"][0]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 4,
                "comment": None,
                "version": entry["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    returned_summary = put_resp.json()["summaries"][0]

    get_resp = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    fetched_summary = get_resp["students"][0]["summary"]

    assert returned_summary["sum_score"] == fetched_summary["sum_score"]
    assert returned_summary["percentage"] == fetched_summary["percentage"]


@pytest.mark.asyncio
async def test_batch_update_missing_entry_is_conflict_not_404(
    client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": 999999,
                "lesson_date": "2026-08-01",
                "attendance": True,
                "score": 5,
                "comment": None,
                "version": 1
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 409


@pytest.mark.asyncio
async def test_course_journals_aggregated_aggregates(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get(f"/api/v1/courses/{course_id}/journals", headers=mentor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0

    first = data[0]
    assert "student_count" in first
    assert first["student_count"] == 1
    assert "lesson_count" in first
    assert "cells_expected" in first
    assert first["cells_expected"] == first["student_count"] * first["lesson_count"]
    assert "cells_filled" in first
    assert "avg_percentage" in first
    assert "state" in first
    assert first["state"] in ("upcoming", "empty", "partial", "complete")


@pytest.mark.asyncio
async def test_course_journal_metrics_endpoint(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get(f"/api/v1/courses/{course_id}/journal-metrics", headers=mentor_headers)
    assert resp.status_code == 200
    metrics = resp.json()
    assert "class_avg_percentage" in metrics
    assert "attendance_rate" in metrics
    assert "periods_total" in metrics
    assert "periods_complete" in metrics
    assert "at_risk_count" in metrics
    assert metrics["at_risk_threshold"] == 60


@pytest.mark.asyncio
async def test_mentor_grading_queue_endpoint(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get("/api/v1/mentors/me/grading-queue", headers=mentor_headers)
    assert resp.status_code == 200
    queue = resp.json()
    assert isinstance(queue, list)
    if len(queue) > 0:
        first = queue[0]
        assert "journal_id" in first
        assert "course_id" in first
        assert "course_title" in first
        assert "period_label" in first
        assert "state" in first
        assert "cells_filled" in first
        assert "cells_expected" in first
        assert "is_current" in first




