import pytest
from datetime import date
from decimal import Decimal
from typing import get_type_hints
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import event
from app.core.deps import get_course_progress_repository, get_course_progress_service
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.course_progress_repository import CourseProgressRepositoryInterface
from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
from app.services.course_progress_service import CourseProgressService


@pytest.mark.asyncio
async def test_course_progress_dependencies_type_hints_and_construction(
    db_session: AsyncSession
) -> None:
    repo_hints = get_type_hints(get_course_progress_repository)
    assert repo_hints["return"] is CourseProgressRepositoryInterface

    service_hints = get_type_hints(get_course_progress_service)
    assert service_hints["return"] is CourseProgressService
    assert service_hints["repo"] is CourseProgressRepositoryInterface

    repo = get_course_progress_repository(db_session)
    assert isinstance(repo, SqlAlchemyCourseProgressRepository)
    service = get_course_progress_service(repo)
    assert isinstance(service, CourseProgressService)


@pytest.mark.asyncio
async def test_staff_progress_authorization_and_guards(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    other_mentor = User(
        email="unassigned_mentor@example.com",
        password_hash="hash",
        first_name="Unassigned",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False
    )
    accountant = User(
        email="accountant_staff@example.com",
        password_hash="hash",
        first_name="Accountant",
        last_name="User",
        role=UserRole.ACCOUNTANT,
        must_set_password=False
    )
    db_session.add_all([other_mentor, accountant])
    await db_session.commit()

    course = Course(
        title="Staff Progress Auth Course",
        description="Testing auth guards",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    unauth_resp = await client.get(f"/api/v1/courses/{course.id}/staff-progress")
    assert unauth_resp.status_code == 401

    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_resp = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_resp.status_code == 200

    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_resp = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {mentor_token}"}
    )
    assert mentor_resp.status_code == 200

    unassigned_token = create_access_token(other_mentor.id, other_mentor.role)
    unassigned_resp = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {unassigned_token}"}
    )
    assert unassigned_resp.status_code == 403

    student_token = create_access_token(test_student.id, test_student.role)
    student_resp = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert student_resp.status_code == 403

    accountant_token = create_access_token(accountant.id, accountant.role)
    accountant_resp = await client.get(
        f"/api/v1/courses/{course.id}/staff-progress",
        headers={"Authorization": f"Bearer {accountant_token}"}
    )
    assert accountant_resp.status_code == 403


@pytest.mark.asyncio
async def test_staff_progress_unknown_and_deleted_course(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    missing_resp = await client.get("/api/v1/courses/999999/staff-progress", headers=headers)
    assert missing_resp.status_code == 404

    deleted_course = Course(
        title="Deleted Course",
        description="Soft-deleted course",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE,
        is_deleted=True
    )
    db_session.add(deleted_course)
    await db_session.commit()

    deleted_resp = await client.get(f"/api/v1/courses/{deleted_course.id}/staff-progress", headers=headers)
    assert deleted_resp.status_code == 404


@pytest.mark.asyncio
async def test_staff_progress_empty_states(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course_no_periods = Course(
        title="No Periods Course",
        description="Course without journals",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course_no_periods)
    await db_session.commit()

    enroll = Enrollment(
        student_id=test_student.id,
        course_id=course_no_periods.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enroll)
    await db_session.commit()

    resp1 = await client.get(f"/api/v1/courses/{course_no_periods.id}/staff-progress", headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["periods"] == []
    assert len(data1["students"]) == 1
    assert data1["students"][0]["period_results"] == []
    assert "scheduled_period_mean" not in data1["students"][0]
    assert "average_scope" not in data1["students"][0]

    course_no_students = Course(
        title="No Students Course",
        description="Course without enrollments",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course_no_students)
    await db_session.commit()

    j1 = Journal(
        course_id=course_no_students.id,
        period_label="Week 1",
        period_start=date(2026, 8, 1),
        period_end=date(2026, 8, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=70
    )
    db_session.add(j1)
    await db_session.commit()

    resp2 = await client.get(f"/api/v1/courses/{course_no_students.id}/staff-progress", headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert len(data2["periods"]) == 1
    assert data2["students"] == []


@pytest.mark.asyncio
async def test_staff_progress_canonical_cohort_exclusion(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    active_user = User(
        email="cohort_active@example.com",
        password_hash="hash",
        first_name="Active",
        last_name="User",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    withdrawn_user = User(
        email="cohort_withdrawn@example.com",
        password_hash="hash",
        first_name="Withdrawn",
        last_name="User",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    deleted_enroll_user = User(
        email="cohort_del_enroll@example.com",
        password_hash="hash",
        first_name="DelEnroll",
        last_name="User",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    deleted_user = User(
        email="cohort_del_user@example.com",
        password_hash="hash",
        first_name="Deleted",
        last_name="User",
        role=UserRole.STUDENT,
        must_set_password=False,
        is_deleted=True
    )
    mentor_as_student = User(
        email="mentor_enrolled@example.com",
        password_hash="hash",
        first_name="MentorStudent",
        last_name="User",
        role=UserRole.MENTOR,
        must_set_password=False
    )
    db_session.add_all([active_user, withdrawn_user, deleted_enroll_user, deleted_user, mentor_as_student])
    await db_session.commit()

    course = Course(
        title="Cohort Test Course",
        description="Testing canonical cohort",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    e_active = Enrollment(
        student_id=active_user.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE,
        is_deleted=False
    )
    e_withdrawn = Enrollment(
        student_id=withdrawn_user.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.WITHDRAWN,
        is_deleted=False
    )
    e_deleted = Enrollment(
        student_id=deleted_enroll_user.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE,
        is_deleted=True
    )
    e_deleted_user = Enrollment(
        student_id=deleted_user.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE,
        is_deleted=False
    )
    e_mentor = Enrollment(
        student_id=mentor_as_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE,
        is_deleted=False
    )
    db_session.add_all([e_active, e_withdrawn, e_deleted, e_deleted_user, e_mentor])
    await db_session.commit()

    resp = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    students = resp.json()["students"]
    student_ids = [s["student_id"] for s in students]

    assert active_user.id in student_ids
    assert withdrawn_user.id in student_ids
    assert deleted_enroll_user.id not in student_ids
    assert deleted_user.id not in student_ids
    assert mentor_as_student.id not in student_ids


@pytest.mark.asyncio
async def test_staff_progress_semantics_missing_vs_unknown_and_bonus(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course = Course(
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

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("200.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)
    await db_session.commit()

    p1 = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=80
    )
    p2 = Journal(
        course_id=course.id,
        period_label="Week 2",
        period_start=date(2026, 9, 8),
        period_end=date(2026, 9, 14),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=80
    )
    p3 = Journal(
        course_id=course.id,
        period_label="Week 3",
        period_start=date(2026, 9, 15),
        period_end=date(2026, 9, 21),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    p4 = Journal(
        course_id=course.id,
        period_label="Week 4",
        period_start=date(2026, 9, 22),
        period_end=date(2026, 9, 28),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=0
    )
    p5 = Journal(
        course_id=course.id,
        period_label="Week 5",
        period_start=date(2026, 9, 29),
        period_end=date(2026, 10, 5),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    db_session.add_all([p1, p2, p3, p4, p5])
    await db_session.commit()

    s_p1 = JournalStudentSummary(
        journal_id=p1.id,
        student_id=test_student.id,
        sum_score=85,
        max_period_score=80,
        exam_score=70,
        bonus_score=15
    )
    s_p2 = JournalStudentSummary(
        journal_id=p2.id,
        student_id=test_student.id,
        sum_score=0,
        max_period_score=80,
        exam_score=0,
        bonus_score=0
    )
    s_p3 = JournalStudentSummary(
        journal_id=p3.id,
        student_id=test_student.id,
        sum_score=110,
        max_period_score=100,
        exam_score=90,
        bonus_score=20
    )
    s_p4 = JournalStudentSummary(
        journal_id=p4.id,
        student_id=test_student.id,
        sum_score=10,
        max_period_score=0,
        exam_score=0,
        bonus_score=10
    )
    db_session.add_all([s_p1, s_p2, s_p3, s_p4])
    await db_session.commit()

    resp = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    student = data["students"][0]
    assert student["first_name"] == test_student.first_name
    assert student["last_name"] == test_student.last_name
    assert "color_hex" not in student
    assert "scheduled_period_mean" not in student
    assert "average_scope" not in student
    assert student["grading_provenance"] == "unknown"

    res_map = {r["period_id"]: r for r in student["period_results"]}

    r1 = res_map[p1.id]
    assert r1["grading_state"] == "unknown"
    assert r1["score"] == 85
    assert r1["max_score"] == 80
    assert r1["percentage"] == 106.25

    r2 = res_map[p2.id]
    assert r2["grading_state"] == "unknown"
    assert r2["score"] == 0
    assert r2["max_score"] == 80
    assert r2["percentage"] == 0.0

    r3 = res_map[p3.id]
    assert r3["grading_state"] == "unknown"
    assert r3["score"] == 110
    assert r3["max_score"] == 100
    assert r3["percentage"] == 110.0

    r4 = res_map[p4.id]
    assert r4["grading_state"] == "unknown"
    assert r4["score"] == 10
    assert r4["max_score"] == 0
    assert r4["percentage"] is None

    r5 = res_map[p5.id]
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
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course = Course(
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

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("150.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)
    await db_session.commit()

    j32 = Journal(
        course_id=course.id,
        period_label="Denom 32",
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 7),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=32
    )
    j160 = Journal(
        course_id=course.id,
        period_label="Denom 160",
        period_start=date(2026, 9, 8),
        period_end=date(2026, 9, 14),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    j_bonus = Journal(
        course_id=course.id,
        period_label="Denom 100 Bonus",
        period_start=date(2026, 9, 15),
        period_end=date(2026, 9, 21),
        period_type=JournalPeriodType.WEEK,
        exam_max_score=100
    )
    db_session.add_all([j32, j160, j_bonus])
    await db_session.commit()

    s32 = JournalStudentSummary(
        journal_id=j32.id,
        student_id=test_student.id,
        sum_score=1,
        max_period_score=32
    )
    s160 = JournalStudentSummary(
        journal_id=j160.id,
        student_id=test_student.id,
        sum_score=1,
        max_period_score=160
    )
    s_bonus = JournalStudentSummary(
        journal_id=j_bonus.id,
        student_id=test_student.id,
        sum_score=150,
        max_period_score=100
    )
    db_session.add_all([s32, s160, s_bonus])
    await db_session.commit()

    resp = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    student = resp.json()["students"][0]
    res_map = {r["period_id"]: r for r in student["period_results"]}

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
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course = Course(
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

    students = []
    enrollments = []
    for i in range(5):
        st = User(
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
        en = Enrollment(
            student_id=st.id,
            course_id=course.id,
            price_at_enrollment=Decimal("100.00"),
            color_hex="#083D91",
            status=EnrollmentStatus.ACTIVE
        )
        enrollments.append(en)
    db_session.add_all(enrollments)
    await db_session.commit()

    journals = []
    for j_idx in range(4):
        j = Journal(
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

    summaries = []
    for st in students:
        for j in journals:
            s = JournalStudentSummary(
                journal_id=j.id,
                student_id=st.id,
                sum_score=50,
                max_period_score=70,
                exam_score=50,
                bonus_score=0
            )
            summaries.append(s)
    db_session.add_all(summaries)
    await db_session.commit()

    query_count = 0

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        nonlocal query_count
        query_count += 1

    from app.tests.conftest import test_engine
    event.listen(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)

    try:
        response = await client.get(
            f"/api/v1/courses/{course.id}/staff-progress",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["students"]) == 5
        assert len(data["periods"]) == 4

        assert query_count <= 6
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", before_cursor_execute)
