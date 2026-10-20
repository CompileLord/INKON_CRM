import pytest
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.payment import Payment, PaymentMethod
from app.workers.tasks import archive_expired_courses, check_payment_reminders
from app.telegram_bot.bot import bot


@pytest.mark.asyncio
async def test_mentor_analytics_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course = Course(
        title="Math",
        description="Intro math",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("120.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("120.0"),
        color_hex="#00FF00",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)

    journal = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 7),
        period_type=JournalPeriodType.WEEK
    )
    db_session.add(journal)
    await db_session.commit()

    summary = JournalStudentSummary(is_graded=True,
        journal_id=journal.id,
        student_id=test_student.id,
        exam_score=90,
        bonus_score=2,
        sum_score=92,
        attendance_count=3,
        total_lessons=3
    )
    db_session.add(summary)
    await db_session.commit()

    response = await client.get(f"/api/v1/mentors/{test_mentor.id}/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["active_courses_count"] == 1
    assert data["total_students_count"] == 1
    assert data["average_student_score"] == 92.0
    assert data["average_student_score_grading_state"] == "unknown"
    assert data["average_student_score_provenance"] == "unknown"
    assert data["average_student_score_summary_count"] == 1
    assert data["average_student_score_basis"] == "all_summaries_on_non_deleted_courses_including_archived_raw_points"

    profile_response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=headers)
    assert profile_response.status_code == 200
    profile_data = profile_response.json()
    assert profile_data["avg_score"] == 0.0
    assert profile_data["avg_score_grading_state"] == "unknown"
    assert profile_data["avg_score_provenance"] == "unknown"
    assert profile_data["avg_score_summary_count"] == 1
    assert profile_data["avg_score_defined_ratio_count"] == 0
    assert profile_data["avg_score_undefined_ratio_count"] == 1
    assert profile_data["avg_score_defined_ratios_mean"] is None


@pytest.mark.asyncio
async def test_mentor_aggregate_contract_preserves_populations_and_unknown_grading(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    active_course = Course(
        title="Active aggregate course",
        description="Aggregate contract fixture",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("120.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    archived_course = Course(
        title="Archived aggregate course",
        description="Aggregate contract fixture",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("120.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ARCHIVED
    )
    deleted_course = Course(
        title="Deleted aggregate course",
        description="Aggregate contract fixture",
        start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("120.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
        is_deleted=True
    )
    db_session.add_all([active_course, archived_course, deleted_course])
    await db_session.flush()
    deleted_enrollment_student = User(
        email="soft-deleted-enrollment@example.com",
        password_hash=None,
        first_name="Deleted",
        last_name="Enrollment",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    soft_deleted_course_student = User(
        email="soft-deleted-course-only-student@example.com",
        password_hash=None,
        first_name="Deleted Course",
        last_name="Only",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    db_session.add_all([deleted_enrollment_student, soft_deleted_course_student])
    await db_session.flush()
    journals = [
        Journal(course_id=active_course.id, period_label="Zero", period_start=date(2026, 7, 1), period_end=date(2026, 7, 7), period_type=JournalPeriodType.WEEK),
        Journal(course_id=active_course.id, period_label="Above maximum", period_start=date(2026, 7, 8), period_end=date(2026, 7, 14), period_type=JournalPeriodType.WEEK),
        Journal(course_id=active_course.id, period_label="Different maximum", period_start=date(2026, 7, 15), period_end=date(2026, 7, 21), period_type=JournalPeriodType.WEEK),
        Journal(course_id=active_course.id, period_label="Negative maximum", period_start=date(2026, 7, 22), period_end=date(2026, 7, 28), period_type=JournalPeriodType.WEEK),
        Journal(course_id=archived_course.id, period_label="Undefined ratio", period_start=date(2026, 6, 1), period_end=date(2026, 6, 7), period_type=JournalPeriodType.WEEK),
        Journal(course_id=deleted_course.id, period_label="Soft deleted course", period_start=date(2026, 5, 1), period_end=date(2026, 5, 7), period_type=JournalPeriodType.WEEK)
    ]
    db_session.add_all(journals)
    await db_session.flush()
    db_session.add_all([
        JournalStudentSummary(is_graded=True, journal_id=journals[0].id, student_id=test_student.id, sum_score=0, max_period_score=100),
        JournalStudentSummary(is_graded=True, journal_id=journals[1].id, student_id=test_student.id, sum_score=150, max_period_score=100),
        JournalStudentSummary(is_graded=True, journal_id=journals[2].id, student_id=test_student.id, sum_score=100, max_period_score=200),
        JournalStudentSummary(is_graded=True, journal_id=journals[3].id, student_id=test_student.id, sum_score=20, max_period_score=-4),
        JournalStudentSummary(is_graded=True, journal_id=journals[4].id, student_id=test_student.id, sum_score=40, max_period_score=0),
        JournalStudentSummary(is_graded=True, journal_id=journals[5].id, student_id=test_student.id, sum_score=80, max_period_score=100)
    ])
    db_session.add_all([
        Enrollment(student_id=test_student.id, course_id=active_course.id, price_at_enrollment=Decimal("120.0"), color_hex="#00FF00", status=EnrollmentStatus.ACTIVE),
        Enrollment(student_id=test_student.id, course_id=archived_course.id, price_at_enrollment=Decimal("120.0"), color_hex="#00FF00", status=EnrollmentStatus.WITHDRAWN),
        Enrollment(student_id=test_student.id, course_id=deleted_course.id, price_at_enrollment=Decimal("120.0"), color_hex="#00FF00", status=EnrollmentStatus.COMPLETED),
        Enrollment(student_id=deleted_enrollment_student.id, course_id=active_course.id, price_at_enrollment=Decimal("120.0"), color_hex="#00FF00", status=EnrollmentStatus.ACTIVE, is_deleted=True),
        Enrollment(student_id=soft_deleted_course_student.id, course_id=deleted_course.id, price_at_enrollment=Decimal("120.0"), color_hex="#00FF00", status=EnrollmentStatus.WITHDRAWN)
    ])
    await db_session.commit()

    analytics_response = await client.get(f"/api/v1/mentors/{test_mentor.id}/analytics", headers=admin_headers)
    profile_response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=admin_headers)
    assert analytics_response.status_code == 200
    assert profile_response.status_code == 200
    analytics = analytics_response.json()
    profile = profile_response.json()
    assert analytics["active_courses_count"] == 1
    assert analytics["total_students_count"] == 2
    assert analytics["average_student_score"] == pytest.approx(310 / 5)
    assert analytics["average_student_score_summary_count"] == 5
    assert analytics["average_student_score_grading_state"] == "unknown"
    assert analytics["active_courses_population"] == "active_non_deleted_courses"
    assert analytics["total_students_population"] == "non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses"
    assert profile["avg_score"] == 70.0
    assert profile["avg_score_summary_count"] == 6
    assert profile["avg_score_defined_ratio_count"] == 4
    assert profile["avg_score_undefined_ratio_count"] == 2
    assert profile["avg_score_defined_ratios_mean"] == pytest.approx(70.0)
    assert profile["avg_score_grading_state"] == "unknown"
    assert profile["active_students_count"] == 1

    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    student_profile_response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=student_headers)
    assert student_profile_response.status_code == 200

