from typing import Callable
import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.course_schedule import CourseSchedule












@pytest.fixture(autouse=True)
def school_day_2026_05_20(freeze_school_today: Callable[[date], None]) -> None:
    freeze_school_today(date(2026, 5, 20))


@pytest.mark.asyncio
async def test_student_profile_deterministic_clock_and_lesson_calculation(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from app.main import app
    from app.core.deps import get_student_profile_service
    from app.services.schedule_service import LessonScheduleService
    from app.services.student_profile_service import StudentProfileService
    from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    same_day_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Exact Monday Course",
            "description": "Start and end on June 1",
            "start_date": "2026-06-01",
            "end_date": "2026-06-02",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    assert same_day_resp.status_code == 201
    same_day_id = same_day_resp.json()["id"]

    before_start_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Future Course",
            "description": "Starts June 8",
            "start_date": "2026-06-08",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "160.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "10:00:00", "time_end": "11:30:00"}],
        },
        headers=admin_headers,
    )
    assert before_start_resp.status_code == 201
    before_start_id = before_start_resp.json()["id"]

    expired_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Expired Active Course",
            "description": "Ended May 31",
            "start_date": "2026-05-01",
            "end_date": "2026-05-31",
            "exam_type": "weekly",
            "price": "120.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "10:00:00", "time_end": "11:30:00"}],
        },
        headers=admin_headers,
    )
    assert expired_resp.status_code == 201
    expired_id = expired_resp.json()["id"]

    for cid in [same_day_id, before_start_id, expired_id]:
        await client.post(
            "/api/v1/enrollments/",
            json={"student_id": test_student.id, "course_id": cid},
            headers=admin_headers,
        )

    fixed_utc = datetime(2026, 5, 31, 20, 30, 0, tzinfo=timezone.utc)
    custom_schedule_service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_utc)
    custom_user_repo = SQLAlchemyUserRepository(db_session)
    custom_profile_service = StudentProfileService(user_repo=custom_user_repo, schedule_service=custom_schedule_service)

    app.dependency_overrides[get_student_profile_service] = lambda: custom_profile_service
    try:
        student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
        profile_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
        assert profile_resp.status_code == 200
        courses = profile_resp.json()["courses"]

        same_day_entry = next(c for c in courses if c["course"]["id"] == same_day_id)
        before_entry = next(c for c in courses if c["course"]["id"] == before_start_id)
        expired_entry = next(c for c in courses if c["course"]["id"] == expired_id)

        expected_same_day_dt = datetime(2026, 6, 1, 2, 0, 0, tzinfo=ZoneInfo("Asia/Dushanbe"))
        expected_before_dt = datetime(2026, 6, 8, 10, 0, 0, tzinfo=ZoneInfo("Asia/Dushanbe"))

        assert same_day_entry["bucket"] == "active"
        assert datetime.fromisoformat(same_day_entry["next_lesson_at"]) == expected_same_day_dt
        assert before_entry["bucket"] == "active"
        assert datetime.fromisoformat(before_entry["next_lesson_at"]) == expected_before_dt
        assert expired_entry["bucket"] == "active"
        assert expired_entry["next_lesson_at"] is None

        admin_check_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=admin_headers)
        assert admin_check_resp.status_code == 200
        admin_courses = admin_check_resp.json()["courses"]
        admin_same_day = next(c for c in admin_courses if c["course"]["id"] == same_day_id)
        assert admin_same_day["next_lesson_at"] == same_day_entry["next_lesson_at"]

        mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, UserRole.MENTOR)}"}
        mentor_check_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=mentor_headers)
        assert mentor_check_resp.status_code == 200
        mentor_courses = mentor_check_resp.json()["courses"]
        mentor_same_day = next(c for c in mentor_courses if c["course"]["id"] == same_day_id)
        assert mentor_same_day["next_lesson_at"] == same_day_entry["next_lesson_at"]
    finally:
        app.dependency_overrides.pop(get_student_profile_service, None)


@pytest.mark.asyncio
async def test_student_profile_db_repository_eligibility_matrix(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    from datetime import datetime, timezone
    from zoneinfo import ZoneInfo
    from app.main import app
    from app.core.deps import get_student_profile_service
    from app.services.schedule_service import LessonScheduleService
    from app.services.student_profile_service import StudentProfileService
    from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    eligible_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Active Eligible",
            "description": "Active course with schedule",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    eligible_id = eligible_resp.json()["id"]

    expired_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Active Expired",
            "description": "Active course past end date",
            "start_date": "2026-05-01",
            "end_date": "2026-05-31",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    expired_id = expired_resp.json()["id"]

    archived_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Archived Course",
            "description": "Archived course",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    archived_id = archived_resp.json()["id"]
    archived_course = await db_session.get(Course, archived_id)
    archived_course.status = CourseStatus.ARCHIVED

    dropped_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Dropped Enrollment",
            "description": "Student dropped enrollment",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    dropped_id = dropped_resp.json()["id"]

    no_schedules_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix No Schedules",
            "description": "No schedules attached",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    assert no_schedules_resp.status_code == 201
    no_schedules_id = no_schedules_resp.json()["id"]

    deleted_course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Deleted Course",
            "description": "Soft deleted course",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    deleted_course_id = deleted_course_resp.json()["id"]

    deleted_enroll_course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Matrix Deleted Enrollment Course",
            "description": "Course with soft deleted enrollment",
            "start_date": "2026-06-01",
            "end_date": "2026-06-30",
            "exam_type": "weekly",
            "price": "100.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 0, "time_start": "02:00:00", "time_end": "03:30:00"}],
        },
        headers=admin_headers,
    )
    deleted_enroll_course_id = deleted_enroll_course_resp.json()["id"]

    enroll_map = {}
    for cid in [eligible_id, expired_id, archived_id, dropped_id, no_schedules_id, deleted_course_id, deleted_enroll_course_id]:
        e_resp = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": test_student.id, "course_id": cid},
            headers=admin_headers,
        )
        assert e_resp.status_code == 201
        enroll_map[cid] = e_resp.json()["id"]

    dropped_enroll = await db_session.get(Enrollment, enroll_map[dropped_id])
    dropped_enroll.status = EnrollmentStatus.WITHDRAWN

    del_course = await db_session.get(Course, deleted_course_id)
    del_course.is_deleted = True

    del_enroll = await db_session.get(Enrollment, enroll_map[deleted_enroll_course_id])
    del_enroll.is_deleted = True

    schedule_select_stmt = select(CourseSchedule).filter(CourseSchedule.course_id == no_schedules_id)
    persisted_schedules = (await db_session.execute(schedule_select_stmt)).scalars().all()
    for persisted_schedule in persisted_schedules:
        await db_session.delete(persisted_schedule)

    await db_session.commit()

    fixed_utc = datetime(2026, 5, 31, 20, 30, 0, tzinfo=timezone.utc)
    custom_schedule_service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_utc)
    custom_user_repo = SQLAlchemyUserRepository(db_session)
    custom_profile_service = StudentProfileService(user_repo=custom_user_repo, schedule_service=custom_schedule_service)

    app.dependency_overrides[get_student_profile_service] = lambda: custom_profile_service
    try:
        student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
        profile_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
        assert profile_resp.status_code == 200
        courses = profile_resp.json()["courses"]
        course_ids = [c["course"]["id"] for c in courses]

        assert deleted_course_id not in course_ids
        assert deleted_enroll_course_id not in course_ids

        eligible_entry = next(c for c in courses if c["course"]["id"] == eligible_id)
        assert eligible_entry["bucket"] == "active"
        assert datetime.fromisoformat(eligible_entry["next_lesson_at"]) == datetime(2026, 6, 1, 2, 0, 0, tzinfo=ZoneInfo("Asia/Dushanbe"))

        expired_entry = next(c for c in courses if c["course"]["id"] == expired_id)
        assert expired_entry["bucket"] == "active"
        assert expired_entry["next_lesson_at"] is None

        archived_entry = next(c for c in courses if c["course"]["id"] == archived_id)
        assert archived_entry["bucket"] == "archive"
        assert archived_entry["next_lesson_at"] is None

        dropped_entry = next(c for c in courses if c["course"]["id"] == dropped_id)
        assert dropped_entry["bucket"] == "archive"
        assert dropped_entry["next_lesson_at"] is None

        no_sched_entry = next(c for c in courses if c["course"]["id"] == no_schedules_id)
        assert no_sched_entry["bucket"] == "active"
        assert no_sched_entry["next_lesson_at"] is None
    finally:
        app.dependency_overrides.pop(get_student_profile_service, None)


@pytest.mark.asyncio
async def test_student_profile_bulk_schedule_query_count_across_courses(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    from sqlalchemy import event

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    course_ids = []
    for idx in range(3):
        resp = await client.post(
            "/api/v1/courses/",
            json={
                "title": f"Bulk Test Course {idx}",
                "description": f"Testing bulk query {idx}",
                "start_date": "2026-01-01",
                "end_date": "2026-12-31",
                "exam_type": "weekly",
                "price": "100.00",
                "mentor_id": test_mentor.id,
                "schedules": [
                    {"day_of_week": idx % 7, "time_start": "09:00:00", "time_end": "10:30:00"}
                ],
            },
            headers=admin_headers,
        )
        assert resp.status_code == 201
        cid = resp.json()["id"]
        course_ids.append(cid)
        enroll_resp = await client.post(
            "/api/v1/enrollments/",
            json={"student_id": test_student.id, "course_id": cid},
            headers=admin_headers,
        )
        assert enroll_resp.status_code == 201

    schedule_queries: list[str] = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if "course_schedules" in statement:
            schedule_queries.append(statement)

    engine_to_listen = db_session.bind.sync_engine if hasattr(db_session.bind, "sync_engine") else db_session.bind
    event.listen(engine_to_listen, "before_cursor_execute", before_cursor_execute)

    try:
        student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
        profile_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
        assert profile_resp.status_code == 200
        assert len(schedule_queries) == 1
    finally:
        event.remove(engine_to_listen, "before_cursor_execute", before_cursor_execute)


@pytest.mark.asyncio
async def test_student_profile_access_guards_and_mentor_authorization(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
    db_session: AsyncSession,
):
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}

    other_student = User(
        email="other_student@example.com",
        password_hash="hash",
        first_name="Other",
        last_name="Learner",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    unassigned_mentor = User(
        email="unassigned_mentor@example.com",
        password_hash="hash",
        first_name="Unassigned",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add_all([other_student, unassigned_mentor])
    await db_session.commit()
    await db_session.refresh(other_student)
    await db_session.refresh(unassigned_mentor)

    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Auth Guard Course",
            "description": "Checking route boundaries",
            "start_date": "2026-01-01",
            "end_date": "2030-12-31",
            "exam_type": "weekly",
            "price": "140.00",
            "mentor_id": test_mentor.id,
            "schedules": [{"day_of_week": 1, "time_start": "09:00:00", "time_end": "10:30:00"}],
        },
        headers=admin_headers,
    )
    assert course_resp.status_code == 201
    course_id = course_resp.json()["id"]

    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"}
    self_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert self_resp.status_code == 200

    other_student_headers = {"Authorization": f"Bearer {create_access_token(other_student.id, UserRole.STUDENT)}"}
    denied_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=other_student_headers)
    assert denied_resp.status_code == 403

    unassigned_mentor_headers = {"Authorization": f"Bearer {create_access_token(unassigned_mentor.id, UserRole.MENTOR)}"}
    unassigned_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=unassigned_mentor_headers)
    assert unassigned_resp.status_code == 403

    assigned_mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, UserRole.MENTOR)}"}
    mentor_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=assigned_mentor_headers)
    assert mentor_resp.status_code == 200
    assert mentor_resp.json()["courses"][0]["next_lesson_at"] == self_resp.json()["courses"][0]["next_lesson_at"]

    superadmin_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=admin_headers)
    assert superadmin_resp.status_code == 200
    assert superadmin_resp.json()["courses"][0]["next_lesson_at"] == self_resp.json()["courses"][0]["next_lesson_at"]
