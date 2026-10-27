from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.user import User, UserRole
from app.services.finance_service import CourseMonthCalendar, FinanceService, get_dushanbe_today

ENROLLMENTS_URL: str = "/api/v1/enrollments/"
REASON: str = "Scholarship approved by the director"


@dataclass(frozen=True)
class CourseFixture:
    id: int
    start_date: date
    end_date: date


def headers_for(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


async def create_course(
    session: AsyncSession, mentor: User, started_days_ago: int, length_days: int, price: str = "100.00",
) -> CourseFixture:
    today: date = get_dushanbe_today()
    start_date: date = today - timedelta(days=started_days_ago)
    course: Course = Course(
        title="Grants", description="Grant fixtures", mentor_id=mentor.id, price=Decimal(price),
        start_date=start_date, end_date=start_date + timedelta(days=length_days),
        exam_type=CourseExamType.MONTHLY,
    )
    session.add(course)
    await session.commit()
    return CourseFixture(course.id, course.start_date, course.end_date)


async def create_student_user(session: AsyncSession, email: str, payment_day: int = 20) -> User:
    student: User = User(
        first_name="Pupil", last_name=email.split("@")[0], email=email, role=UserRole.STUDENT,
        payment_day_of_month=payment_day,
    )
    session.add(student)
    await session.commit()
    return student


async def enroll(
    client: AsyncClient, admin: User, student: User, course: CourseFixture, **extra: Any,
) -> Response:
    return await client.post(
        ENROLLMENTS_URL, json={"student_id": student.id, "course_id": course.id, **extra}, headers=headers_for(admin),
    )


async def charges_of(session: AsyncSession, enrollment_id: int) -> list[Charge]:
    session.expire_all()
    return list((await session.scalars(select(Charge).where(
        Charge.enrollment_id == enrollment_id).order_by(Charge.sequence_no, Charge.id))).all())


async def build_started_enrollment(
    session: AsyncSession, student: User, course: CourseFixture, price: str = "100.00",
) -> Enrollment:
    enrollment: Enrollment = Enrollment(
        student_id=student.id, course_id=course.id, price_at_enrollment=Decimal(price), color_hex="#000000",
        status=EnrollmentStatus.ACTIVE,
        enrolled_at=datetime.combine(course.start_date, time.min, tzinfo=timezone.utc),
    )
    session.add(enrollment)
    await session.flush()
    await FinanceService(session).generate_schedule_for_enrollment(enrollment.id)
    await session.commit()
    return enrollment


def month_starts(course: CourseFixture) -> list[date]:
    return CourseMonthCalendar.billed_starts(course.start_date, course.end_date, course.start_date)
