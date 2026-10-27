import pytest
from datetime import date
from decimal import Decimal
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_staff_progress_periods_carry_graded_flag(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> None:
    course = Course(
        title="Graded Flag Test Course",
        description="Testing period graded flag",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 10, 31),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("150.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment = Enrollment(
        course_id=course.id,
        student_id=test_student.id,
        status=EnrollmentStatus.ACTIVE,
        price_at_enrollment=Decimal("150.00"),
        color_hex="#123456",
    )
    db_session.add(enrollment)
    await db_session.flush()

    period_graded = Journal(
        course_id=course.id,
        period_label="Month 1 - Graded",
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    period_scheduled = Journal(
        course_id=course.id,
        period_label="Month 2 - Scheduled Ungraded",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    period_entry_only = Journal(
        course_id=course.id,
        period_label="Month 3 - Entry Graded",
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    db_session.add_all([period_graded, period_scheduled, period_entry_only])
    await db_session.flush()

    entry_graded = JournalEntry(
        journal_id=period_graded.id,
        student_id=test_student.id,
        lesson_date=date(2026, 8, 5),
        attendance=True,
        score=5,
        is_graded=True,
    )
    summary_graded = JournalStudentSummary(
        journal_id=period_graded.id,
        student_id=test_student.id,
        sum_score=50,
        max_period_score=100,
        attendance_count=10,
        total_lessons=10,
        is_graded=True,
    )
    summary_scheduled = JournalStudentSummary(
        journal_id=period_scheduled.id,
        student_id=test_student.id,
        sum_score=0,
        max_period_score=100,
        attendance_count=0,
        total_lessons=0,
        is_graded=False,
    )
    entry_only_graded = JournalEntry(
        journal_id=period_entry_only.id,
        student_id=test_student.id,
        lesson_date=date(2026, 10, 5),
        attendance=True,
        score=4,
        is_graded=True,
    )
    summary_entry_only = JournalStudentSummary(
        journal_id=period_entry_only.id,
        student_id=test_student.id,
        sum_score=0,
        max_period_score=100,
        attendance_count=0,
        total_lessons=0,
        is_graded=False,
    )
    db_session.add_all([
        entry_graded,
        summary_graded,
        summary_scheduled,
        entry_only_graded,
        summary_entry_only,
    ])
    await db_session.commit()

    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    response: Response = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data: dict[str, object] = response.json()
    periods_data: list[dict[str, object]] = data["periods"]  # type: ignore[assignment]
    assert len(periods_data) == 3

    period_graded_data: dict[str, object] = next(
        p for p in periods_data if p["id"] == period_graded.id
    )
    period_scheduled_data: dict[str, object] = next(
        p for p in periods_data if p["id"] == period_scheduled.id
    )
    period_entry_only_data: dict[str, object] = next(
        p for p in periods_data if p["id"] == period_entry_only.id
    )

    assert period_graded_data["has_graded_entries"] is True
    assert period_scheduled_data["has_graded_entries"] is False
    assert period_entry_only_data["has_graded_entries"] is True

    student_token: str = create_access_token(test_student.id, test_student.role)
    student_response: Response = await client.get(
        f"/api/v1/courses/{course.id}/class-progress",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert student_response.status_code == 200
    student_data: dict[str, object] = student_response.json()
    student_periods_data: list[dict[str, object]] = student_data["periods"]  # type: ignore[assignment]

    st_period_graded_data: dict[str, object] = next(
        p for p in student_periods_data if p["id"] == period_graded.id
    )
    st_period_scheduled_data: dict[str, object] = next(
        p for p in student_periods_data if p["id"] == period_scheduled.id
    )
    st_period_entry_only_data: dict[str, object] = next(
        p for p in student_periods_data if p["id"] == period_entry_only.id
    )

    assert st_period_graded_data["has_graded_entries"] is True
    assert st_period_scheduled_data["has_graded_entries"] is False
    assert st_period_entry_only_data["has_graded_entries"] is True
