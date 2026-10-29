from datetime import date, timedelta
from decimal import Decimal
from typing import Any
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.tests.factories import create_course, create_user, enroll_student


@pytest.mark.asyncio
async def test_mentor_performance_numbers_use_consistent_set_of_graded_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    admin_headers: dict[str, str] = {"Authorization": f"Bearer {admin_token}"}
    today: date = date.today()

    active_course: Course = await create_course(
        db_session,
        test_mentor,
        title="Physics",
        description="Applied physics",
        start_date=today - timedelta(days=60),
        end_date=today + timedelta(days=60),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("150.0"),
    )
    await db_session.flush()

    active_student_two: User = await create_user(
        db_session,
        UserRole.STUDENT,
        email="second.active.student@example.com",
        password_hash=None,
        first_name="Faridun",
        last_name="Saidov",
    )
    withdrawn_student: User = await create_user(
        db_session,
        UserRole.STUDENT,
        email="withdrawn.student@example.com",
        password_hash=None,
        first_name="Rustam",
        last_name="Karimov",
    )
    deleted_student: User = await create_user(
        db_session,
        UserRole.STUDENT,
        email="deleted.student@example.com",
        password_hash=None,
        first_name="Deleted",
        last_name="Student",
        is_deleted=True,
    )
    await db_session.flush()

    await enroll_student(
        db_session,
        test_student,
        active_course,
        price_at_enrollment=Decimal("150.0"),
        color_hex="#112233",
    )
    await enroll_student(
        db_session,
        active_student_two,
        active_course,
        price_at_enrollment=Decimal("150.0"),
        color_hex="#445566",
    )
    await enroll_student(
        db_session,
        withdrawn_student,
        active_course,
        price_at_enrollment=Decimal("150.0"),
        color_hex="#778899",
        status=EnrollmentStatus.WITHDRAWN,
    )
    await enroll_student(
        db_session,
        deleted_student,
        active_course,
        price_at_enrollment=Decimal("150.0"),
        color_hex="#99AABB",
    )
    await db_session.flush()

    past_period_one: Journal = Journal(
        course_id=active_course.id,
        period_label="Month 1",
        period_start=today - timedelta(days=60),
        period_end=today - timedelta(days=31),
        period_type=JournalPeriodType.MONTH,
    )
    past_period_two: Journal = Journal(
        course_id=active_course.id,
        period_label="Month 2",
        period_start=today - timedelta(days=30),
        period_end=today - timedelta(days=1),
        period_type=JournalPeriodType.MONTH,
    )
    future_period: Journal = Journal(
        course_id=active_course.id,
        period_label="Month 3",
        period_start=today + timedelta(days=1),
        period_end=today + timedelta(days=30),
        period_type=JournalPeriodType.MONTH,
    )
    db_session.add_all([past_period_one, past_period_two, future_period])
    await db_session.flush()

    summaries: list[JournalStudentSummary] = [
        JournalStudentSummary(
            journal_id=past_period_one.id,
            student_id=test_student.id,
            sum_score=80,
            max_period_score=100,
            is_graded=True,
        ),
        JournalStudentSummary(
            journal_id=past_period_two.id,
            student_id=test_student.id,
            sum_score=90,
            max_period_score=100,
            is_graded=True,
        ),
        JournalStudentSummary(
            journal_id=past_period_one.id,
            student_id=active_student_two.id,
            sum_score=70,
            max_period_score=100,
            is_graded=True,
        ),
        JournalStudentSummary(
            journal_id=past_period_two.id,
            student_id=active_student_two.id,
            sum_score=0,
            max_period_score=100,
            is_graded=False,
        ),
        JournalStudentSummary(
            journal_id=future_period.id,
            student_id=active_student_two.id,
            sum_score=0,
            max_period_score=100,
            is_graded=False,
        ),
        JournalStudentSummary(
            journal_id=past_period_one.id,
            student_id=withdrawn_student.id,
            sum_score=95,
            max_period_score=100,
            is_graded=True,
        ),
        JournalStudentSummary(
            journal_id=past_period_one.id,
            student_id=deleted_student.id,
            sum_score=100,
            max_period_score=100,
            is_graded=True,
        ),
    ]
    db_session.add_all(summaries)
    await db_session.commit()

    analytics_response: Any = await client.get(
        f"/api/v1/mentors/{test_mentor.id}/analytics", headers=admin_headers
    )
    profile_response: Any = await client.get(
        f"/api/v1/mentors/{test_mentor.id}/profile", headers=admin_headers
    )
    assert analytics_response.status_code == 200
    assert profile_response.status_code == 200

    analytics_data: dict[str, Any] = analytics_response.json()
    profile_data: dict[str, Any] = profile_response.json()

    assert profile_data["active_students_count"] == 2
    assert analytics_data["total_students_count"] == 2

    assert profile_data["avg_score_summary_count"] == 3
    assert analytics_data["average_student_score_summary_count"] == 3
    assert profile_data["avg_score_defined_ratio_count"] == 3
    assert profile_data["avg_score_undefined_ratio_count"] == 0

    assert analytics_data["average_student_score"] == pytest.approx(80.0)
    assert profile_data["avg_score_defined_ratios_mean"] == pytest.approx(80.0)
    assert profile_data["avg_score"] == 80.0
    assert analytics_data["average_student_score_grading_state"] == "unknown"
    assert profile_data["avg_score_grading_state"] == "unknown"


@pytest.mark.asyncio
async def test_mentor_performance_when_no_periods_are_graded(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    admin_headers: dict[str, str] = {"Authorization": f"Bearer {admin_token}"}
    today: date = date.today()

    active_course: Course = await create_course(
        db_session,
        test_mentor,
        title="Chemistry",
        description="Organic chemistry",
        start_date=today - timedelta(days=60),
        end_date=today + timedelta(days=60),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("180.0"),
    )
    await db_session.flush()

    await enroll_student(
        db_session,
        test_student,
        active_course,
        price_at_enrollment=Decimal("180.0"),
        color_hex="#112233",
    )
    await db_session.flush()

    period_one: Journal = Journal(
        course_id=active_course.id,
        period_label="Month 1",
        period_start=today - timedelta(days=60),
        period_end=today - timedelta(days=31),
        period_type=JournalPeriodType.MONTH,
    )
    db_session.add(period_one)
    await db_session.flush()

    ungraded_summary: JournalStudentSummary = JournalStudentSummary(
        journal_id=period_one.id,
        student_id=test_student.id,
        sum_score=0,
        max_period_score=100,
        is_graded=False,
    )
    db_session.add(ungraded_summary)
    await db_session.commit()

    analytics_response: Any = await client.get(
        f"/api/v1/mentors/{test_mentor.id}/analytics", headers=admin_headers
    )
    profile_response: Any = await client.get(
        f"/api/v1/mentors/{test_mentor.id}/profile", headers=admin_headers
    )
    assert analytics_response.status_code == 200
    assert profile_response.status_code == 200

    analytics_data: dict[str, Any] = analytics_response.json()
    profile_data: dict[str, Any] = profile_response.json()

    assert analytics_data["total_students_count"] == 1
    assert profile_data["active_students_count"] == 1
    assert analytics_data["average_student_score_summary_count"] == 0
    assert profile_data["avg_score_summary_count"] == 0
    assert profile_data["avg_score_defined_ratio_count"] == 0
    assert analytics_data["average_student_score"] == 0.0
    assert profile_data["avg_score_defined_ratios_mean"] is None
    assert profile_data["avg_score"] == 0.0
    assert analytics_data["average_student_score_grading_state"] == "missing"
    assert profile_data["avg_score_grading_state"] == "missing"
