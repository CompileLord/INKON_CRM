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
from app.models.enrollment import EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.course_progress_repository import CourseProgressRepositoryInterface
from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
from app.services.course_progress_service import CourseProgressService
from app.tests.factories import create_course, create_user, enroll_student


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
    other_mentor = await create_user(
        db_session,
        UserRole.MENTOR,
        email="unassigned_mentor@example.com",
        password_hash="hash",
        first_name="Unassigned",
        last_name="Mentor",
    )
    accountant = await create_user(
        db_session,
        UserRole.ACCOUNTANT,
        email="accountant_staff@example.com",
        password_hash="hash",
        first_name="Accountant",
        last_name="User",
    )
    await db_session.commit()

    course = await create_course(db_session, test_mentor, title="Staff Progress Auth Course", description="Testing auth guards")
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

    deleted_course = await create_course(
        db_session,
        test_mentor,
        title="Deleted Course",
        description="Soft-deleted course",
        is_deleted=True,
    )
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

    course_no_periods = await create_course(db_session, test_mentor, title="No Periods Course", description="Course without journals")
    await db_session.commit()

    await enroll_student(db_session, test_student, course_no_periods, price_at_enrollment=Decimal("100.00"), color_hex="#083D91")
    await db_session.commit()

    resp1 = await client.get(f"/api/v1/courses/{course_no_periods.id}/staff-progress", headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["periods"] == []
    assert len(data1["students"]) == 1
    assert data1["students"][0]["period_results"] == []
    assert "scheduled_period_mean" not in data1["students"][0]
    assert "average_scope" not in data1["students"][0]

    course_no_students = await create_course(db_session, test_mentor, title="No Students Course", description="Course without enrollments")
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

    active_user = await create_user(
        db_session,
        UserRole.STUDENT,
        email="cohort_active@example.com",
        password_hash="hash",
        first_name="Active",
        last_name="User",
    )
    withdrawn_user = await create_user(
        db_session,
        UserRole.STUDENT,
        email="cohort_withdrawn@example.com",
        password_hash="hash",
        first_name="Withdrawn",
        last_name="User",
    )
    deleted_enroll_user = await create_user(
        db_session,
        UserRole.STUDENT,
        email="cohort_del_enroll@example.com",
        password_hash="hash",
        first_name="DelEnroll",
        last_name="User",
    )
    deleted_user = await create_user(
        db_session,
        UserRole.STUDENT,
        email="cohort_del_user@example.com",
        password_hash="hash",
        first_name="Deleted",
        last_name="User",
        is_deleted=True,
    )
    mentor_as_student = await create_user(
        db_session,
        UserRole.MENTOR,
        email="mentor_enrolled@example.com",
        password_hash="hash",
        first_name="MentorStudent",
        last_name="User",
    )
    await db_session.commit()

    course = await create_course(db_session, test_mentor, title="Cohort Test Course", description="Testing canonical cohort")
    await db_session.commit()

    await enroll_student(
        db_session,
        active_user,
        course,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        is_deleted=False,
    )
    await enroll_student(
        db_session,
        withdrawn_user,
        course,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        status=EnrollmentStatus.WITHDRAWN,
        is_deleted=False,
    )
    await enroll_student(
        db_session,
        deleted_enroll_user,
        course,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        is_deleted=True,
    )
    await enroll_student(
        db_session,
        deleted_user,
        course,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        is_deleted=False,
    )
    await enroll_student(
        db_session,
        mentor_as_student,
        course,
        price_at_enrollment=Decimal("100.00"),
        color_hex="#083D91",
        is_deleted=False,
    )
    await db_session.commit()

    resp = await client.get(f"/api/v1/courses/{course.id}/staff-progress", headers=headers)
    assert resp.status_code == 200
    students = resp.json()["students"]
    student_ids = [s["student_id"] for s in students]

    assert active_user.id in student_ids
    assert withdrawn_user.id not in student_ids
    assert deleted_enroll_user.id not in student_ids
    assert deleted_user.id not in student_ids
    assert mentor_as_student.id not in student_ids

