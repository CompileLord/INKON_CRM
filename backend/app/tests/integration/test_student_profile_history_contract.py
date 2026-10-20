import pytest
from datetime import date
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary


@pytest.mark.asyncio
async def test_student_profile_history_with_soft_deleted_enrollment_and_retained_summary(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    course_active = Course(
        title="Active Enrolled Course",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    course_deleted = Course(
        title="Historical Deleted Course",
        description="Course description",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ARCHIVED,
        is_deleted=True,
    )
    db_session.add_all([course_active, course_deleted])
    await db_session.flush()

    enrollment_active = Enrollment(
        course_id=course_active.id,
        student_id=test_student.id,
        price_at_enrollment="100.00",
        color_hex="#111111",
        status=EnrollmentStatus.ACTIVE,
        is_deleted=False,
    )
    enrollment_deleted = Enrollment(
        course_id=course_deleted.id,
        student_id=test_student.id,
        price_at_enrollment="100.00",
        color_hex="#222222",
        status=EnrollmentStatus.COMPLETED,
        is_deleted=True,
    )
    db_session.add_all([enrollment_active, enrollment_deleted])

    journal_active = Journal(
        course_id=course_active.id,
        period_label="Active Period",
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70,
    )
    journal_deleted = Journal(
        course_id=course_deleted.id,
        period_label="Deleted Period",
        period_start=date(2025, 1, 1),
        period_end=date(2025, 1, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70,
    )
    db_session.add_all([journal_active, journal_deleted])
    await db_session.flush()

    summary_active = JournalStudentSummary(is_graded=True, 
        journal_id=journal_active.id,
        student_id=test_student.id,
        sum_score=80,
        max_period_score=100,
        attendance_count=4,
        total_lessons=4,
    )
    summary_deleted = JournalStudentSummary(is_graded=True, 
        journal_id=journal_deleted.id,
        student_id=test_student.id,
        sum_score=60,
        max_period_score=100,
        attendance_count=3,
        total_lessons=4,
    )
    db_session.add_all([summary_active, summary_deleted])
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    totals = data["totals"]
    assert "performance" not in totals
    assert totals["avg_percentage"] == 70.0
    assert totals["attendance_percentage"] == 87.5
    assert totals["total_lessons"] == 8
    assert totals["absences"] == 1
    assert totals["active_course_count"] == 1
    assert totals["archived_course_count"] == 0
    assert data["avg_score"] == 70.0
    assert data["total_lessons"] == 8
    assert data["absences"] == 1

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["grading_state"] == "unknown"
    assert perf["grading_provenance"] == "unknown"
    assert perf["raw_avg_percentage"] == 70.0
    assert perf["attendance_percentage"] == 87.5
    assert perf["attendance_denominator"] == 8
    assert perf["attended_lessons"] == 7
    assert perf["absences"] == 1
    assert perf["total_lessons"] == 8
    assert perf["period_summaries_count"] == 2
    assert perf["periods_with_max_score_count"] == 2

    assert len(data["courses"]) == 1
    course_entry = data["courses"][0]
    assert course_entry["course"]["id"] == course_active.id
    assert course_entry["my_avg_percentage"] == 80.0
    assert course_entry["attendance_percentage"] == 100.0
    assert course_entry["absences"] == 0

    c_perf = course_entry["performance"]
    assert c_perf["scope"] == "single_course"
    assert c_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert c_perf["denominator_basis"] == "stored_period_total_lessons"
    assert c_perf["grading_state"] == "unknown"
    assert c_perf["raw_avg_percentage"] == 80.0
    assert c_perf["attendance_percentage"] == 100.0
    assert c_perf["attendance_denominator"] == 4
    assert c_perf["attended_lessons"] == 4
    assert c_perf["absences"] == 0
    assert c_perf["total_lessons"] == 4
    assert c_perf["period_summaries_count"] == 1
    assert c_perf["periods_with_max_score_count"] == 1



@pytest.mark.asyncio
async def test_student_profile_history_with_no_current_enrollments_retained_summaries(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    past_course = Course(
        title="Past Finished Course",
        description="Course description",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ARCHIVED,
        is_deleted=True,
    )
    db_session.add(past_course)
    await db_session.flush()

    past_journal = Journal(
        course_id=past_course.id,
        period_label="Past Period",
        period_start=date(2025, 1, 1),
        period_end=date(2025, 1, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70,
    )
    db_session.add(past_journal)
    await db_session.flush()

    retained_summary = JournalStudentSummary(is_graded=True, 
        journal_id=past_journal.id,
        student_id=test_student.id,
        sum_score=90,
        max_period_score=100,
        attendance_count=5,
        total_lessons=6,
    )
    db_session.add(retained_summary)
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    totals = data["totals"]
    assert "performance" not in totals
    assert totals["avg_percentage"] == 90.0
    assert totals["attendance_percentage"] == 83.3
    assert totals["total_lessons"] == 6
    assert totals["absences"] == 1
    assert totals["active_course_count"] == 0
    assert totals["archived_course_count"] == 0
    assert data["avg_score"] == 90.0
    assert data["total_lessons"] == 6
    assert data["absences"] == 1

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["grading_state"] == "unknown"
    assert perf["grading_provenance"] == "unknown"
    assert perf["raw_avg_percentage"] == 90.0
    assert perf["attendance_percentage"] == 83.3
    assert perf["attendance_denominator"] == 6
    assert perf["attended_lessons"] == 5
    assert perf["absences"] == 1
    assert perf["total_lessons"] == 6
    assert perf["period_summaries_count"] == 1
    assert perf["periods_with_max_score_count"] == 1

    assert len(data["courses"]) == 0



@pytest.mark.asyncio
async def test_student_profile_authorization_and_cross_user_boundaries(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    other_student = User(
        email="other_boundary_student@example.com",
        password_hash="hash",
        first_name="Other",
        last_name="Student",
        role=UserRole.STUDENT,
    )
    unassigned_mentor = User(
        email="unassigned_boundary_mentor@example.com",
        password_hash="hash",
        first_name="Unassigned",
        last_name="Mentor",
        role=UserRole.MENTOR,
    )
    db_session.add_all([other_student, unassigned_mentor])
    await db_session.flush()

    course = Course(
        title="Boundary Course",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(course_id=course.id, student_id=test_student.id, price_at_enrollment="100.00", color_hex="#123456", status=EnrollmentStatus.ACTIVE)
    db_session.add(enrollment)
    await db_session.commit()

    anon_me = await client.get("/api/v1/students/me/profile")
    assert anon_me.status_code == 401

    anon_id = await client.get(f"/api/v1/students/{test_student.id}/profile")
    assert anon_id.status_code == 401

    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    self_resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert self_resp.status_code == 200

    other_student_headers = {"Authorization": f"Bearer {create_access_token(other_student.id, other_student.role)}"}
    denied_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=other_student_headers)
    assert denied_resp.status_code == 403

    mentor_me = await client.get(
        "/api/v1/students/me/profile",
        headers={"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}
    )
    assert mentor_me.status_code == 400

    assigned_mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}
    assigned_mentor_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=assigned_mentor_headers)
    assert assigned_mentor_resp.status_code == 200
    assert assigned_mentor_resp.json()["performance"]["scope"] == "all_recorded_student_period_summaries"

    unassigned_mentor_headers = {"Authorization": f"Bearer {create_access_token(unassigned_mentor.id, unassigned_mentor.role)}"}
    unassigned_mentor_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=unassigned_mentor_headers)
    assert unassigned_mentor_resp.status_code == 403

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    admin_resp = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=admin_headers)
    assert admin_resp.status_code == 200

