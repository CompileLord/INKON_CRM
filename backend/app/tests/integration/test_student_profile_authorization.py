from datetime import date
from typing import Optional

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository


@pytest.mark.asyncio
async def test_student_profile_role_boundary_and_directory_accountant_access(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_accountant: User,
    test_mentor: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    other_student = User(
        email="profile_boundary_other_student@example.com",
        password_hash="hash",
        first_name="Other",
        last_name="Student",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    unassigned_mentor = User(
        email="profile_boundary_unassigned_mentor@example.com",
        password_hash="hash",
        first_name="Unassigned",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    db_session.add_all([other_student, unassigned_mentor])
    await db_session.flush()

    course = Course(
        title="Profile Authorization Course",
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
    db_session.add(
        Enrollment(
            course_id=course.id,
            student_id=test_student.id,
            price_at_enrollment="100.00",
            color_hex="#123456",
            status=EnrollmentStatus.ACTIVE,
        )
    )
    await db_session.commit()

    async def headers_for(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    original_get_by_id = SQLAlchemyUserRepository.get_by_id
    target_lookups: list[int] = []

    async def track_target_lookup(repository: SQLAlchemyUserRepository, user_id: int) -> Optional[User]:
        if user_id in [test_student.id, 2147483647]:
            target_lookups.append(user_id)
        return await original_get_by_id(repository, user_id)

    monkeypatch.setattr(SQLAlchemyUserRepository, "get_by_id", track_target_lookup)

    anonymous_response = await client.get(f"/api/v1/students/{test_student.id}/profile")
    assert anonymous_response.status_code == 401

    accountant_headers = await headers_for(test_accountant)
    accountant_existing_response = await client.get(
        f"/api/v1/students/{test_student.id}/profile",
        headers=accountant_headers,
    )
    accountant_missing_response = await client.get(
        "/api/v1/students/2147483647/profile",
        headers=accountant_headers,
    )
    assert accountant_existing_response.status_code == 403
    assert accountant_missing_response.status_code == 403
    assert accountant_existing_response.json() == {"detail": "Not enough permissions"}
    assert accountant_missing_response.json() == {"detail": "Not enough permissions"}
    assert target_lookups == []

    accountant_directory_response = await client.get(
        "/api/v1/students/?page=1&page_size=20",
        headers=accountant_headers,
    )
    assert accountant_directory_response.status_code == 200

    student_headers = await headers_for(test_student)
    own_profile_response = await client.get(
        f"/api/v1/students/{test_student.id}/profile",
        headers=student_headers,
    )
    other_profile_response = await client.get(
        f"/api/v1/students/{other_student.id}/profile",
        headers=student_headers,
    )
    assert own_profile_response.status_code == 200
    assert own_profile_response.json()["user"]["id"] == test_student.id
    assert other_profile_response.status_code == 403

    mentor_headers = await headers_for(test_mentor)
    assigned_profile_response = await client.get(
        f"/api/v1/students/{test_student.id}/profile",
        headers=mentor_headers,
    )
    unassigned_headers = await headers_for(unassigned_mentor)
    unassigned_profile_response = await client.get(
        f"/api/v1/students/{test_student.id}/profile",
        headers=unassigned_headers,
    )
    assert assigned_profile_response.status_code == 200
    assert assigned_profile_response.json()["performance"]["scope"] == "all_recorded_student_period_summaries"
    assert unassigned_profile_response.status_code == 403

    admin_headers = await headers_for(test_admin)
    admin_profile_response = await client.get(
        f"/api/v1/students/{test_student.id}/profile",
        headers=admin_headers,
    )
    assert admin_profile_response.status_code == 200
