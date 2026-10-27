from datetime import date
from decimal import Decimal
from typing import Any, Dict, List
import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User


@pytest.mark.asyncio
async def test_courses_and_progress_endpoints_agree_on_graded_periods(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    headers: Dict[str, str] = {"Authorization": f"Bearer {admin_token}"}

    course: Course = Course(
        title="Physics UX-B1",
        description="Progress consistency test",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 11, 1),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("400.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
    )
    db_session.add(course)
    await db_session.commit()

    enrollment: Enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("400.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE,
    )
    db_session.add(enrollment)
    await db_session.commit()

    p1: Journal = Journal(
        course_id=course.id,
        period_label="Month 1",
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 31),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    p2: Journal = Journal(
        course_id=course.id,
        period_label="Month 2",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    p3: Journal = Journal(
        course_id=course.id,
        period_label="Month 3",
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        period_type=JournalPeriodType.MONTH,
        exam_max_score=100,
    )
    db_session.add_all([p1, p2, p3])
    await db_session.commit()

    s1: JournalStudentSummary = JournalStudentSummary(
        journal_id=p1.id,
        student_id=test_student.id,
        homework_score=40,
        attendance_score=20,
        exam_score=0,
        bonus_score=0,
        sum_score=60,
        max_period_score=100,
        attendance_count=1,
        total_lessons=4,
        is_graded=True,
    )
    s2: JournalStudentSummary = JournalStudentSummary(
        journal_id=p2.id,
        student_id=test_student.id,
        homework_score=0,
        attendance_score=60,
        exam_score=0,
        bonus_score=0,
        sum_score=60,
        max_period_score=100,
        attendance_count=3,
        total_lessons=4,
        is_graded=False,
    )
    s3: JournalStudentSummary = JournalStudentSummary(
        journal_id=p3.id,
        student_id=test_student.id,
        homework_score=0,
        attendance_score=60,
        exam_score=0,
        bonus_score=0,
        sum_score=60,
        max_period_score=100,
        attendance_count=3,
        total_lessons=4,
        is_graded=False,
    )
    db_session.add_all([s1, s2, s3])
    await db_session.commit()

    courses_resp: Response = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=headers)
    assert courses_resp.status_code == 200
    courses_payload: Dict[str, Any] = courses_resp.json()
    student_course: Dict[str, Any] = next(c for c in courses_payload["courses"] if c["course"]["id"] == course.id)

    progress_resp: Response = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert progress_resp.status_code == 200
    progress_payload: Dict[str, Any] = progress_resp.json()
    student_progress: Dict[str, Any] = next(s for s in progress_payload["students"] if s["student_id"] == test_student.id)

    progress_graded_results: List[Dict[str, Any]] = [
        r for r in student_progress["period_results"]
        if r["percentage"] is not None and r["grading_state"] != "missing"
    ]
    progress_graded_count: int = len(progress_graded_results)
    progress_avg_percentage: float = round(
        sum(float(r["percentage"]) for r in progress_graded_results) / progress_graded_count,
        1,
    )

    assert student_course["periods_graded"] == 1
    assert student_course["my_avg_percentage"] == 60.0
    assert progress_graded_count == 1
    assert progress_avg_percentage == 60.0

    assert student_course["periods_graded"] == progress_graded_count
    assert student_course["my_avg_percentage"] == progress_avg_percentage

    res_by_period: Dict[int, Dict[str, Any]] = {r["period_id"]: r for r in student_progress["period_results"]}
    assert res_by_period[p1.id]["percentage"] == 60.0
    assert res_by_period[p1.id]["grading_state"] == "unknown"
    assert res_by_period[p2.id]["percentage"] is None
    assert res_by_period[p2.id]["grading_state"] == "missing"
    assert res_by_period[p3.id]["percentage"] is None
    assert res_by_period[p3.id]["grading_state"] == "missing"
