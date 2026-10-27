from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_mentor_active_students_only_include_active_courses(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User,
) -> None:
    courses: list[Course] = [
        Course(title=f"Course {status.value}", description="Course", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
               exam_type=CourseExamType.MONTHLY, price=Decimal("100.00"), mentor_id=test_mentor.id, status=status)
        for status in (CourseStatus.ACTIVE, CourseStatus.ARCHIVED)
    ]
    students: list[User] = [
        User(first_name="Student", last_name=str(index), email=f"mentor-active-course-{index}@example.test", role=UserRole.STUDENT)
        for index in range(3)
    ]
    db_session.add_all([*courses, *students])
    await db_session.flush()
    index: int
    student: User
    for index, student in enumerate(students):
        db_session.add(Enrollment(student_id=student.id, course_id=courses[0 if index == 0 else 1].id,
                                  price_at_enrollment=Decimal("100.00"), color_hex="#112233", status=EnrollmentStatus.ACTIVE))
    await db_session.commit()
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    response: Response = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=headers)
    assert response.status_code == 200
    assert len(response.json()["active_courses"]) == 1
    assert response.json()["active_students_count"] == 1
    assert response.json()["active_students_population"] == "active_enrollments_on_active_non_deleted_courses"
