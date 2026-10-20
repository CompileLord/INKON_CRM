from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User
from app.tests.integration.test_document_delivery import DocumentFixtures


class AccessFixtures:
    @staticmethod
    async def course(session: AsyncSession, mentor: User, title: str) -> Course:
        course: Course = Course(
            title=title, description=title, start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31), exam_type="monthly",
            price=Decimal("100.00"), mentor_id=mentor.id,
        )
        session.add(course)
        await session.flush()
        return course

    @staticmethod
    async def enroll(session: AsyncSession, student: User, course: Course) -> Enrollment:
        enrollment: Enrollment = Enrollment(
            student_id=student.id, course_id=course.id,
            price_at_enrollment=Decimal("100.00"), color_hex="#000000",
        )
        session.add(enrollment)
        await session.commit()
        return enrollment


@pytest.mark.asyncio
@pytest.mark.parametrize("relationship", ["active", "withdrawn", "completed", "deleted", "deleted_course", "unrelated"])
async def test_mentor_document_visibility_requires_active_relationship(
    relationship: str, client: AsyncClient, db_session: AsyncSession,
    test_admin: User, test_student: User, test_mentor: User,
) -> None:
    course: Course = await AccessFixtures.course(db_session, test_mentor, "Related course")
    enrollment: Enrollment = await AccessFixtures.enroll(db_session, test_student, course)
    if relationship in ("withdrawn", "completed"):
        enrollment.status = EnrollmentStatus(relationship)
    elif relationship == "deleted":
        enrollment.is_deleted = True
    elif relationship == "deleted_course":
        course.is_deleted = True
    elif relationship == "unrelated":
        course.mentor_id = test_admin.id
    await db_session.commit()
    content: bytes = b"%PDF-1.7\nprivate"
    document: dict = await DocumentFixtures.upload(client, test_admin, test_student, content)
    headers: dict[str, str] = DocumentFixtures.headers(test_mentor)
    listing: Response = await client.get(
        "/api/v1/documents/", params={"owner_id": test_student.id}, headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == (1 if relationship == "active" else 0)
    assert [item["id"] for item in listing.json()["items"]] == (
        [document["id"]] if relationship == "active" else []
    )
    targeted_listing: Response = await client.get(
        "/api/v1/documents/", params={"owner_type": "student", "owner_id": test_student.id}, headers=headers,
    )
    assert targeted_listing.status_code == (200 if relationship == "active" else 404)
    download: Response = await client.get(f"/api/v1/documents/{document['id']}/download", headers=headers)
    assert download.status_code == (200 if relationship == "active" else 404)
    if relationship == "active":
        assert download.content == content
    else:
        assert content not in download.content
