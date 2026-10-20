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
async def test_student_profile_no_records_missing_and_unavailable(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    course = Course(
        title="Clean Course No Records",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(
        course_id=course.id,
        student_id=test_student.id,
        price_at_enrollment="100.00",
        color_hex="#123456",
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["grading_state"] == "missing"
    assert perf["grading_provenance"] == "unknown"
    assert perf["raw_avg_percentage"] is None
    assert perf["attendance_percentage"] is None
    assert perf["attendance_denominator"] == 0
    assert perf["attended_lessons"] == 0
    assert perf["absences"] == 0
    assert perf["total_lessons"] == 0
    assert perf["period_summaries_count"] == 0
    assert perf["periods_with_max_score_count"] == 0

    totals = data["totals"]
    assert "performance" not in totals
    assert "grading_state" not in totals
    assert totals["avg_percentage"] == 0.0
    assert totals["attendance_percentage"] == 100.0
    assert totals["absences"] == 0
    assert totals["total_lessons"] == 0
    assert totals["active_course_count"] == 1
    assert totals["archived_course_count"] == 0

    assert len(data["courses"]) == 1
    course_entry = data["courses"][0]
    assert "grading_state" not in course_entry
    course_perf = course_entry["performance"]
    assert course_perf["scope"] == "single_course"
    assert course_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert course_perf["denominator_basis"] == "stored_period_total_lessons"
    assert course_perf["grading_state"] == "missing"
    assert course_perf["grading_provenance"] == "unknown"
    assert course_perf["raw_avg_percentage"] is None
    assert course_perf["attendance_percentage"] is None
    assert course_perf["attendance_denominator"] == 0
    assert course_perf["period_summaries_count"] == 0
    assert course_perf["periods_with_max_score_count"] == 0



@pytest.mark.asyncio
async def test_student_profile_initialized_zero_row_unknown_provenance_not_graded_zero(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    course = Course(
        title="Zero Row Course",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="150.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(
        course_id=course.id,
        student_id=test_student.id,
        price_at_enrollment="150.00",
        color_hex="#123456",
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)

    journal = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70,
    )
    db_session.add(journal)
    await db_session.flush()

    summary = JournalStudentSummary(
        journal_id=journal.id,
        student_id=test_student.id,
        homework_score=0,
        attendance_score=0,
        exam_score=0,
        bonus_score=0,
        sum_score=0,
        max_period_score=80,
        attendance_count=0,
        total_lessons=12,
    )
    db_session.add(summary)
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["grading_state"] == "unknown"
    assert perf["grading_provenance"] == "unknown"
    assert perf["raw_avg_percentage"] is None
    assert perf["attendance_percentage"] is None
    assert perf["attendance_denominator"] == 0
    assert perf["attended_lessons"] == 0
    assert perf["absences"] == 0
    assert perf["total_lessons"] == 0
    assert perf["period_summaries_count"] == 1
    assert perf["periods_with_max_score_count"] == 1

    totals = data["totals"]
    assert "performance" not in totals
    assert totals["avg_percentage"] == 0.0
    assert totals["attendance_percentage"] == 100.0
    assert totals["absences"] == 0
    assert totals["total_lessons"] == 0

    course_perf = data["courses"][0]["performance"]
    assert course_perf["scope"] == "single_course"
    assert course_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert course_perf["denominator_basis"] == "stored_period_total_lessons"
    assert course_perf["grading_state"] == "unknown"
    assert course_perf["grading_provenance"] == "unknown"
    assert course_perf["raw_avg_percentage"] is None
    assert course_perf["attendance_percentage"] is None
    assert course_perf["attendance_denominator"] == 0
    assert course_perf["absences"] == 0
    assert course_perf["total_lessons"] == 0
    assert course_perf["period_summaries_count"] == 1
    assert course_perf["periods_with_max_score_count"] == 1



@pytest.mark.asyncio
async def test_student_profile_positive_max_zero_and_above_100_unclamped(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    course = Course(
        title="Unclamped Scores Course",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="200.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(
        course_id=course.id,
        student_id=test_student.id,
        price_at_enrollment="200.00",
        color_hex="#123456",
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)

    j1 = Journal(course_id=course.id, period_label="P1", period_start=date(2026, 1, 1), period_end=date(2026, 1, 7), period_type=JournalPeriodType.WEEK, exam_max_score=70)
    j2 = Journal(course_id=course.id, period_label="P2", period_start=date(2026, 1, 8), period_end=date(2026, 1, 14), period_type=JournalPeriodType.WEEK, exam_max_score=70)
    j3 = Journal(course_id=course.id, period_label="P3", period_start=date(2026, 1, 15), period_end=date(2026, 1, 21), period_type=JournalPeriodType.WEEK, exam_max_score=70)
    db_session.add_all([j1, j2, j3])
    await db_session.flush()

    s1 = JournalStudentSummary(is_graded=True, journal_id=j1.id, student_id=test_student.id, sum_score=85, max_period_score=80, attendance_count=4, total_lessons=4)
    s2 = JournalStudentSummary(is_graded=True, journal_id=j2.id, student_id=test_student.id, sum_score=110, max_period_score=100, attendance_count=5, total_lessons=6)
    s3 = JournalStudentSummary(is_graded=True, journal_id=j3.id, student_id=test_student.id, sum_score=15, max_period_score=0, attendance_count=0, total_lessons=0)
    db_session.add_all([s1, s2, s3])
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["grading_state"] == "unknown"
    assert perf["grading_provenance"] == "unknown"
    assert perf["raw_avg_percentage"] == 108.12
    assert perf["raw_avg_percentage"] > 100.0
    assert perf["attendance_percentage"] == 90.0
    assert perf["attendance_denominator"] == 10
    assert perf["attended_lessons"] == 9
    assert perf["absences"] == 1
    assert perf["total_lessons"] == 10
    assert perf["period_summaries_count"] == 3
    assert perf["periods_with_max_score_count"] == 2

    course_perf = data["courses"][0]["performance"]
    assert course_perf["scope"] == "single_course"
    assert course_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert course_perf["denominator_basis"] == "stored_period_total_lessons"
    assert course_perf["raw_avg_percentage"] == 108.12
    assert course_perf["attendance_percentage"] == 90.0
    assert course_perf["attendance_denominator"] == 10
    assert course_perf["period_summaries_count"] == 3
    assert course_perf["periods_with_max_score_count"] == 2



@pytest.mark.asyncio
async def test_student_profile_no_attendance_denominator_unavailable(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    course = Course(
        title="No Lessons Attendance Course",
        description="Course description",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="120.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(
        course_id=course.id,
        student_id=test_student.id,
        price_at_enrollment="120.00",
        color_hex="#123456",
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)

    journal = Journal(
        course_id=course.id,
        period_label="Empty Period",
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70,
    )
    db_session.add(journal)
    await db_session.flush()

    summary = JournalStudentSummary(is_graded=True,
        journal_id=journal.id,
        student_id=test_student.id,
        sum_score=50,
        max_period_score=100,
        attendance_count=0,
        total_lessons=0,
    )
    db_session.add(summary)
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    perf = data["performance"]
    assert perf["attendance_percentage"] is None
    assert perf["attendance_denominator"] == 0
    assert perf["raw_avg_percentage"] == 50.0

    totals = data["totals"]
    assert totals["attendance_percentage"] == 100.0

    course_entry = data["courses"][0]
    assert course_entry["performance"]["attendance_percentage"] is None
    assert course_entry["performance"]["attendance_denominator"] == 0
    assert course_entry["attendance_percentage"] == 100.0



@pytest.mark.asyncio
async def test_student_profile_multiple_courses_preserve_real_aggregate_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    test_mentor: User,
    test_student: User
) -> None:
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    c1 = Course(
        title="Course Scope A",
        description="Course description A",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    c2 = Course(
        title="Course Scope B",
        description="Course description B",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price="100.00",
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    e1 = Enrollment(course_id=c1.id, student_id=test_student.id, price_at_enrollment="100.00", color_hex="#111111", status=EnrollmentStatus.ACTIVE)
    e2 = Enrollment(course_id=c2.id, student_id=test_student.id, price_at_enrollment="100.00", color_hex="#222222", status=EnrollmentStatus.ACTIVE)
    db_session.add_all([e1, e2])

    j1 = Journal(course_id=c1.id, period_label="P1", period_start=date(2026, 1, 1), period_end=date(2026, 1, 7), period_type=JournalPeriodType.WEEK, exam_max_score=70)
    j2 = Journal(course_id=c2.id, period_label="P2", period_start=date(2026, 1, 1), period_end=date(2026, 1, 7), period_type=JournalPeriodType.WEEK, exam_max_score=70)
    db_session.add_all([j1, j2])
    await db_session.flush()

    s1 = JournalStudentSummary(is_graded=True, journal_id=j1.id, student_id=test_student.id, sum_score=70, max_period_score=100, attendance_count=8, total_lessons=10)
    s2 = JournalStudentSummary(is_graded=True, journal_id=j2.id, student_id=test_student.id, sum_score=90, max_period_score=100, attendance_count=18, total_lessons=20)
    db_session.add_all([s1, s2])
    await db_session.commit()

    resp = await client.get("/api/v1/students/me/profile", headers=student_headers)
    assert resp.status_code == 200
    data = resp.json()

    perf = data["performance"]
    assert perf["scope"] == "all_recorded_student_period_summaries"
    assert perf["measured_population"] == "all_recorded_student_period_summaries"
    assert perf["denominator_basis"] == "stored_period_total_lessons"
    assert perf["attendance_denominator"] == 30
    assert perf["attended_lessons"] == 26
    assert perf["absences"] == 4
    assert perf["attendance_percentage"] == 86.7
    assert perf["raw_avg_percentage"] == 80.0
    assert perf["period_summaries_count"] == 2
    assert perf["periods_with_max_score_count"] == 2

    courses_by_id = {c["course"]["id"]: c for c in data["courses"]}
    c1_perf = courses_by_id[c1.id]["performance"]
    assert c1_perf["scope"] == "single_course"
    assert c1_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert c1_perf["denominator_basis"] == "stored_period_total_lessons"
    assert c1_perf["attendance_denominator"] == 10
    assert c1_perf["attended_lessons"] == 8
    assert c1_perf["absences"] == 2
    assert c1_perf["attendance_percentage"] == 80.0
    assert c1_perf["raw_avg_percentage"] == 70.0

    c2_perf = courses_by_id[c2.id]["performance"]
    assert c2_perf["scope"] == "single_course"
    assert c2_perf["measured_population"] == "single_course_recorded_period_summaries"
    assert c2_perf["denominator_basis"] == "stored_period_total_lessons"
    assert c2_perf["attendance_denominator"] == 20
    assert c2_perf["attended_lessons"] == 18
    assert c2_perf["absences"] == 2
    assert c2_perf["attendance_percentage"] == 90.0
    assert c2_perf["raw_avg_percentage"] == 90.0
