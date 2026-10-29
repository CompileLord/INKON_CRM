import itertools
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole

_user_sequence: "itertools.count[int]" = itertools.count(1)


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def create_user(
    session: AsyncSession,
    role: UserRole,
    password: str | None = None,
    **overrides: Any,
) -> User:
    sequence_number: int = next(_user_sequence)
    fields: dict[str, Any] = {
        "email": f"factory-{sequence_number}-{uuid.uuid4().hex[:8]}@example.com",
        "first_name": role.value.capitalize(),
        "last_name": "Factory",
        "role": role,
        "must_set_password": False,
    }
    if password is not None:
        fields["password_hash"] = hash_password(password)
    fields.update(overrides)
    user: User = User(**fields)
    session.add(user)
    await session.flush()
    return user


async def create_course(session: AsyncSession, mentor: User, **overrides: Any) -> Course:
    fields: dict[str, Any] = {
        "title": "Factory Course",
        "description": "Factory course description",
        "start_date": date(2026, 8, 1),
        "end_date": date(2026, 8, 31),
        "exam_type": CourseExamType.WEEKLY,
        "price": Decimal("100.00"),
        "mentor_id": mentor.id,
        "status": CourseStatus.ACTIVE,
    }
    fields.update(overrides)
    course: Course = Course(**fields)
    session.add(course)
    await session.flush()
    return course


async def enroll_student(session: AsyncSession, student: User, course: Course, **overrides: Any) -> Enrollment:
    fields: dict[str, Any] = {
        "student_id": student.id,
        "course_id": course.id,
        "price_at_enrollment": course.price,
        "color_hex": "#123456",
        "status": EnrollmentStatus.ACTIVE,
    }
    fields.update(overrides)
    enrollment: Enrollment = Enrollment(**fields)
    session.add(enrollment)
    await session.flush()
    return enrollment
