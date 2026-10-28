from datetime import date
from decimal import Decimal
from typing import Any
import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.user import User


@pytest.mark.asyncio
async def test_student_and_mentor_money_fields_are_not_disclosed(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: Course = Course(title="Privacy", description="Privacy", start_date=date(2026, 1, 1),
                            end_date=date(2026, 12, 1), exam_type="monthly", price=Decimal("700"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id,
                                        price_at_enrollment=Decimal("700"), color_hex="#112233")
    db_session.add(enrollment)
    await db_session.commit()
    headers: dict[str, dict[str, str]] = {
        name: {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}
        for name, user in (("admin", test_admin), ("mentor", test_mentor), ("student", test_student))
    }
    for name in ("admin", "mentor"):
        directory: Response = await client.get("/api/v1/students/", headers=headers[name])
        assert directory.status_code == 200
        item: dict[str, Any] = next(item for item in directory.json()["items"] if item["id"] == test_student.id)
        for key in ("debt_amount", "payment_status", "payment_day_of_month"):
            assert (key in item) == (name == "admin")
        for path in (f"/api/v1/enrollments/?course_id={course.id}", f"/api/v1/enrollments/courses/{course.id}/roster"):
            result: Response = await client.get(path, headers=headers[name])
            assert result.status_code == 200
            for key in ("price_at_enrollment", "billing_mode"):
                assert (key in result.json()["items"][0]) == (name == "admin")
        profile: Response = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=headers[name])
        assert profile.status_code == 200
        assert ("payment_day_of_month" in profile.json()["user"]) == (name == "admin")
    assert (await client.get("/api/v1/students/?payment_status=debt", headers=headers["mentor"])).status_code == 403
    own: Response = await client.get(f"/api/v1/enrollments/?student_id={test_student.id}", headers=headers["student"])
    assert own.status_code == 200
    assert "price_at_enrollment" not in own.json()["items"][0]
    assert "billing_mode" not in own.json()["items"][0]
    assert (await client.get("/api/v1/students/", headers=headers["student"])).status_code == 403
    assert (await client.get(f"/api/v1/enrollments/courses/{course.id}/roster", headers=headers["student"])).status_code == 403
    located: Response = await client.get(f"/api/v1/enrollments/courses/{course.id}/roster/locate?student_id={test_student.id}", headers=headers["mentor"])
    assert located.status_code == 200
    assert "price_at_enrollment" not in located.json()["item"]
    assert "billing_mode" not in located.json()["item"]
