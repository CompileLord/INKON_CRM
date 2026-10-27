from datetime import date
from decimal import Decimal
from typing import Any, Dict, List
import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_staff_progress_semantics_missing_vs_unknown_and_bonus(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    headers: Dict[str, str] = {"Authorization": f"Bearer {admin_token}"}

    course: Course = Course(
        title="Semantics Course",
        description="Semantics testing",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("200.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment: Enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("200.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)
    await db_session.commit()

    p1: Journal = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=80
    )
    p2: Journal = Journal(
        course_id=course.id,
        period_label="Week 2",
        period_start=date(2026, 9, 8),
        period_end=date(2026, 9, 14),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=80
    )
    p3: Journal = Journal(
        course_id=course.id,
        period_label="Week 3",
        period_start=date(2026, 9, 15),
        period_end=date(2026, 9, 21),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    p4: Journal = Journal(
        course_id=course.id,
        period_label="Week 4",
        period_start=date(2026, 9, 22),
        period_end=date(2026, 9, 28),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=0
    )
    p5: Journal = Journal(
        course_id=course.id,
        period_label="Week 5",
        period_start=date(2026, 9, 29),
        period_end=date(2026, 10, 5),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    db_session.add_all([p1, p2, p3, p4, p5])
    await db_session.commit()

    s_p1: JournalStudentSummary = JournalStudentSummary(
        journal_id=p1.id,
        student_id=test_student.id,
        sum_score=85,
        max_period_score=80,
        exam_score=70,
        bonus_score=15,
        is_graded=True,
    )
    s_p2: JournalStudentSummary = JournalStudentSummary(
        journal_id=p2.id,
        student_id=test_student.id,
        sum_score=0,
        max_period_score=80,
        exam_score=0,
        bonus_score=0,
        is_graded=True,
    )
    s_p3: JournalStudentSummary = JournalStudentSummary(
        journal_id=p3.id,
        student_id=test_student.id,
        sum_score=110,
        max_period_score=100,
        exam_score=90,
        bonus_score=20,
        is_graded=True,
    )
    s_p4: JournalStudentSummary = JournalStudentSummary(
        journal_id=p4.id,
        student_id=test_student.id,
        sum_score=10,
        max_period_score=0,
        exam_score=0,
        bonus_score=10,
        is_graded=True,
    )
    db_session.add_all([s_p1, s_p2, s_p3, s_p4])
    await db_session.commit()

    resp: Response = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    data: Dict[str, Any] = resp.json()

    student: Dict[str, Any] = data["students"][0]
    assert student["first_name"] == test_student.first_name
    assert student["last_name"] == test_student.last_name
    assert "color_hex" not in student
    assert "scheduled_period_mean" not in student
    assert "average_scope" not in student
    assert student["grading_provenance"] == "unknown"

    res_map: Dict[int, Dict[str, Any]] = {r["period_id"]: r for r in student["period_results"]}

    r1: Dict[str, Any] = res_map[p1.id]
    assert r1["grading_state"] == "unknown"
    assert r1["score"] == 85
    assert r1["max_score"] == 80
    assert r1["percentage"] == 106.25

    r2: Dict[str, Any] = res_map[p2.id]
    assert r2["grading_state"] == "unknown"
    assert r2["score"] == 0
    assert r2["max_score"] == 80
    assert r2["percentage"] == 0.0

    r3: Dict[str, Any] = res_map[p3.id]
    assert r3["grading_state"] == "unknown"
    assert r3["score"] == 110
    assert r3["max_score"] == 100
    assert r3["percentage"] == 110.0

    r4: Dict[str, Any] = res_map[p4.id]
    assert r4["grading_state"] == "unknown"
    assert r4["score"] == 10
    assert r4["max_score"] == 0
    assert r4["percentage"] is None

    r5: Dict[str, Any] = res_map[p5.id]
    assert r5["grading_state"] == "missing"
    assert r5["score"] is None
    assert r5["max_score"] is None
    assert r5["percentage"] is None


@pytest.mark.asyncio
async def test_staff_progress_canonical_percentage_precision(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    headers: Dict[str, str] = {"Authorization": f"Bearer {admin_token}"}

    course: Course = Course(
        title="Rounding Precision Course",
        description="Testing canonical score_percentage 1/32 and 1/160",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("150.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment: Enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("150.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)
    await db_session.commit()

    j32: Journal = Journal(
        course_id=course.id,
        period_label="Denom 32",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=32
    )
    j160: Journal = Journal(
        course_id=course.id,
        period_label="Denom 160",
        period_start=date(2026, 9, 8),
        period_end=date(2026, 9, 14),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    j_bonus: Journal = Journal(
        course_id=course.id,
        period_label="Denom 100 Bonus",
        period_start=date(2026, 9, 15),
        period_end=date(2026, 9, 21),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    db_session.add_all([j32, j160, j_bonus])
    await db_session.commit()

    s32: JournalStudentSummary = JournalStudentSummary(
        journal_id=j32.id,
        student_id=test_student.id,
        sum_score=1,
        max_period_score=32,
        is_graded=True,
    )
    s160: JournalStudentSummary = JournalStudentSummary(
        journal_id=j160.id,
        student_id=test_student.id,
        sum_score=1,
        max_period_score=160,
        is_graded=True,
    )
    s_bonus: JournalStudentSummary = JournalStudentSummary(
        journal_id=j_bonus.id,
        student_id=test_student.id,
        sum_score=150,
        max_period_score=100,
        is_graded=True,
    )
    db_session.add_all([s32, s160, s_bonus])
    await db_session.commit()

    resp: Response = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    student: Dict[str, Any] = resp.json()["students"][0]
    res_map: Dict[int, Dict[str, Any]] = {r["period_id"]: r for r in student["period_results"]}

    assert res_map[j32.id]["percentage"] == 3.12
    assert res_map[j160.id]["percentage"] == 0.62
    assert res_map[j_bonus.id]["percentage"] == 150.0


@pytest.mark.asyncio
async def test_staff_progress_bounded_query_count(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User
) -> None:
    admin_token: str = create_access_token(test_admin.id, test_admin.role)
    headers: Dict[str, str] = {"Authorization": f"Bearer {admin_token}"}

    course: Course = Course(
        title="Scaling Course",
        description="Testing bounded scaling",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    students: List[User] = []
    enrollments: List[Enrollment] = []
    for i in range(5):
        st: User = User(
            email=f"perf_scale_{i}@example.com",
            password_hash="hash",
            first_name=f"Scale{i}",
            last_name="User",
            role=UserRole.STUDENT,
            must_set_password=False
        )
        students.append(st)
    db_session.add_all(students)
    await db_session.commit()

    for st in students:
        en: Enrollment = Enrollment(
            student_id=st.id,
            course_id=course.id,
            price_at_enrollment=Decimal("100.00"),
            color_hex="#083D91",
            status=EnrollmentStatus.ACTIVE
        )
        enrollments.append(en)
    db_session.add_all(enrollments)
    await db_session.commit()

    journals: List[Journal] = []
    for j_idx in range(4):
        j: Journal = Journal(
            course_id=course.id,
            period_label=f"Week {j_idx + 1}",
            period_start=date(2026, 10, 1 + j_idx * 7),
            period_end=date(2026, 10, 7 + j_idx * 7),
            period_type=JournalPeriodType.WEEK,
            exam_max_score=70
        )
        journals.append(j)
    db_session.add_all(journals)
    await db_session.commit()

    summaries: List[JournalStudentSummary] = []
    for st in students:
        for j in journals:
            s: JournalStudentSummary = JournalStudentSummary(
                journal_id=j.id,
                student_id=st.id,
                sum_score=50,
                max_period_score=70,
                exam_score=50,
                bonus_score=0,
                is_graded=True,
            )
            summaries.append(s)
    db_session.add_all(summaries)
    await db_session.commit()

    query_count: int = 0

    def before_cursor_execute(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any) -> None:
        nonlocal query_count
        query_count += 1

    from app.tests.conftest import test_engine
    event.listen(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)

    try:
        response: Response = await client.get(
            f"/api/v1/courses/{course.id}/staff-progress",
            headers=headers
        )
        assert response.status_code == 200
        data: Dict[str, Any] = response.json()
        assert len(data["students"]) == 5
        assert len(data["periods"]) == 4

        assert query_count <= 6
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
