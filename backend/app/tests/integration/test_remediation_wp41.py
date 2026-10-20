from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository


class MentorPrivacyFixture:
    @staticmethod
    async def create_courses(session: AsyncSession, mentor: User, student: User) -> list[Course]:
        courses: list[Course] = [
            Course(title=title, description=title, start_date=date(2026, 1, 1),
                   end_date=date(2026, 12, 1), exam_type=CourseExamType.MONTHLY,
                   price=Decimal("100.00"), mentor_id=mentor.id)
            for title in ["Enrolled", "Unrelated", "Deleted enrollment", "Deleted course"]
        ]
        other_student: User = User(
            email="other-student@example.com", password_hash=student.password_hash,
            first_name="Other", last_name="Student", role=UserRole.STUDENT,
            must_set_password=False,
        )
        other_mentor: User = User(
            email="other-mentor@example.com", password_hash=mentor.password_hash,
            first_name="Other", last_name="Mentor", role=UserRole.MENTOR,
            must_set_password=False,
        )
        session.add_all([other_student, other_mentor])
        await session.flush()
        other_mentor_course: Course = Course(
            title="Other mentor", description="Other mentor", start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 1), exam_type=CourseExamType.MONTHLY,
            price=Decimal("100.00"), mentor_id=other_mentor.id,
        )
        session.add(other_mentor_course)
        session.add_all(courses)
        await session.flush()
        session.add_all([
            Enrollment(student_id=other_student.id, course_id=courses[1].id,
                       price_at_enrollment=Decimal("100.00"), color_hex="#123456"),
            Enrollment(student_id=student.id, course_id=other_mentor_course.id,
                       price_at_enrollment=Decimal("100.00"), color_hex="#123456"),
        ])
        courses[3].is_deleted = True
        session.add_all([
            Enrollment(student_id=student.id, course_id=courses[index].id,
                       price_at_enrollment=Decimal("100.00"), color_hex="#123456",
                       is_deleted=index == 2)
            for index in [0, 2, 3]
        ])
        mentor.phone = "+992900000001"
        mentor.parent_phone = "+992900000002"
        mentor.parent_telegram_chat_id = 123456
        mentor.date_of_birth = date(1990, 1, 1)
        session.add(mentor)
        await session.commit()
        return courses

    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_student_mentor_profile_contains_only_authorized_courses(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
) -> None:
    courses: list[Course] = await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    assert [course["id"] for course in payload["active_courses"]] == [courses[0].id]
    denied: Response = await client.get(f"/api/v1/courses/{courses[1].id}", headers=MentorPrivacyFixture.headers(test_student))
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_student_mentor_profile_omits_private_identity_and_global_statistics(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
) -> None:
    await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    assert set(payload) == {"user", "active_courses"}
    assert set(payload["user"]) == {"id", "first_name", "last_name", "photo_path", "thumbnail_path"}
    assert payload["user"]["id"] == test_mentor.id
    assert set(payload["active_courses"][0]) == {"id", "title", "photo_path"}


@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["mentor", "admin"])
async def test_staff_mentor_profile_preserves_complete_response(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
    test_admin: User, actor: str,
) -> None:
    courses: list[Course] = await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_mentor if actor == "mentor" else test_admin))
    assert response.status_code == 200
    payload: dict[str, Any] = response.json()
    assert {course["id"] for course in payload["active_courses"]} == {course.id for course in courses[:3]}
    assert payload["user"]["phone"] == "+992900000001"
    assert payload["user"]["parent_phone"] == "+992900000002"
    assert payload["user"]["date_of_birth"] == "1990-01-01"
    assert "active_students_count" in payload
    assert "avg_score_basis" in payload


@pytest.mark.asyncio
async def test_unenrolled_student_cannot_read_mentor_profile(
    client: AsyncClient, test_mentor: User, test_student: User,
) -> None:
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("deletion_target", ["enrollment", "course", "mentor"])
async def test_deleted_relationship_cannot_authorize_student_mentor_card(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
    deletion_target: str,
) -> None:
    courses: list[Course] = await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)
    if deletion_target == "mentor":
        test_mentor.is_deleted = True
    elif deletion_target == "course":
        courses[0].is_deleted = True
    else:
        await db_session.execute(
            update(Enrollment).where(Enrollment.course_id == courses[0].id).values(is_deleted=True)
        )
    await db_session.commit()
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("enrollment_status", [EnrollmentStatus.COMPLETED, EnrollmentStatus.WITHDRAWN])
async def test_historical_enrollment_retains_authorized_mentor_card_access(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
    enrollment_status: EnrollmentStatus,
) -> None:
    courses: list[Course] = await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)
    await db_session.execute(
        update(Enrollment).where(Enrollment.course_id == courses[0].id).values(status=enrollment_status)
    )
    await db_session.commit()
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 200
    assert [course["id"] for course in response.json()["active_courses"]] == [courses[0].id]


@pytest.mark.asyncio
async def test_student_mentor_card_does_not_calculate_staff_statistics(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await MentorPrivacyFixture.create_courses(db_session, test_mentor, test_student)

    async def reject_staff_statistics(repository: SQLAlchemyUserRepository, mentor_id: int) -> dict[str, Any]:
        raise AssertionError("Student card must not request staff statistics")

    monkeypatch.setattr(SQLAlchemyUserRepository, "get_mentor_profile_stats", reject_staff_statistics)
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_role", [UserRole.MENTOR, UserRole.ACCOUNTANT])
async def test_unrelated_staff_cannot_read_mentor_profile(
    client: AsyncClient, db_session: AsyncSession, test_mentor: User, test_student: User,
    actor_role: UserRole,
) -> None:
    test_student.role = actor_role
    await db_session.merge(test_student)
    await db_session.commit()
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=MentorPrivacyFixture.headers(test_student))
    assert response.status_code == 403
