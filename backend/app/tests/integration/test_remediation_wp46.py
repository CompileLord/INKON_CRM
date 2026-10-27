from datetime import date
from decimal import Decimal
from typing import Any, Callable, Collection

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from httpx import AsyncClient, Response
from app.core.security import create_access_token
from app.core.schedule_utils import CourseCopyBudgetExceeded, CourseCopyPlan, LessonDateCalculator
from app.models.charge import Charge
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.services.enrollment_service import EnrollmentService
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.user import User, UserRole
from app.schemas.course import CourseCreate
from app.services.course_service import CourseService


class CourseCopyFixture:
    @staticmethod
    def destination(mentor_id: int, end_date: str = "2026-01-02", daily: bool = False) -> CourseCreate:
        return CourseCreate.model_validate({
            "title": "Destination", "description": "Destination", "start_date": "2026-01-01",
            "end_date": end_date, "exam_type": "weekly", "price": "120.01", "mentor_id": mentor_id,
            "schedules": [
                {"day_of_week": weekday, "time_start": "10:00:00", "time_end": "11:00:00"}
                for weekday in (range(7) if daily else [3])
            ],
        })

    @staticmethod
    async def source(session: AsyncSession, mentor: User, roster_size: int) -> Course:
        course: Course = Course(title="Source", description="Source", start_date=date(2025, 1, 1),
                                end_date=date(2025, 2, 1), exam_type=CourseExamType.MONTHLY,
                                price=Decimal("120.00"), mentor_id=mentor.id)
        session.add(course)
        await session.flush()
        students: list[User] = [
            User(email=f"copy-{index}@example.com", first_name="Copy", last_name=str(index),
                 role=UserRole.STUDENT, must_set_password=False)
            for index in range(roster_size)
        ]
        session.add_all(students)
        await session.flush()
        session.add_all([
            Enrollment(student_id=student.id, course_id=course.id,
                       price_at_enrollment=Decimal("120.00"), color_hex="#123456")
            for student in students
        ])
        await session.commit()
        return course


@pytest.mark.asyncio
@pytest.mark.parametrize(("roster_size", "end_date", "daily"), [
    (101, "2026-01-02", False), (0, "2027-01-02", False), (60, "2026-12-31", True),
])
async def test_copy_budget_rejects_before_destination_mutation(
    db_session: AsyncSession, test_admin: User, test_mentor: User,
    roster_size: int, end_date: str, daily: bool,
) -> None:
    source: Course = await CourseCopyFixture.source(db_session, test_mentor, roster_size)
    service: CourseService = CourseService(db_session)
    destination: CourseCreate = CourseCopyFixture.destination(test_mentor.id, end_date, daily)
    with pytest.raises(HTTPException) as error:
        await service.copy_course(destination, source.id, test_admin)
    assert error.value.status_code == 422
    count: int = (await db_session.execute(select(func.count(Course.id)))).scalar_one()
    assert count == 1
    assert not db_session.new


@pytest.mark.asyncio
async def test_roster_boundary_is_accepted(
    db_session: AsyncSession, test_admin: User, test_mentor: User,
) -> None:
    source: Course = await CourseCopyFixture.source(db_session, test_mentor, 100)
    copied: Course = await CourseService(db_session).copy_course(CourseCopyFixture.destination(test_mentor.id), source.id, test_admin)
    count: int = (await db_session.execute(select(func.count(Enrollment.id)).where(Enrollment.course_id == copied.id))).scalar_one()
    assert count == 100


def test_duration_and_estimated_row_boundaries(test_mentor: User, monkeypatch: pytest.MonkeyPatch) -> None:
    destination: CourseCreate = CourseCopyFixture.destination(test_mentor.id, "2027-01-01")
    plan: CourseCopyPlan = CourseCopyPlan.build(destination, 1)
    assert len(plan.lesson_dates) == 53
    monkeypatch.setattr(CourseCopyPlan, "maximum_rows", plan.estimated_rows)
    assert CourseCopyPlan.build(destination, 1).estimated_rows == plan.estimated_rows
    monkeypatch.setattr(CourseCopyPlan, "maximum_rows", plan.estimated_rows - 1)
    with pytest.raises(CourseCopyBudgetExceeded):
        CourseCopyPlan.build(destination, 1)


class CourseCopySnapshot:
    @staticmethod
    async def capture(session: AsyncSession, course_id: int, student_id: int) -> tuple[list[tuple[Any, ...]], ...]:
        entries: list[tuple[Any, ...]] = [tuple(row) for row in (await session.execute(
            select(JournalEntry.lesson_date, JournalEntry.attendance, JournalEntry.score, JournalEntry.is_graded, JournalEntry.version)
            .join(Journal, Journal.id == JournalEntry.journal_id)
            .where(Journal.course_id == course_id, JournalEntry.student_id == student_id)
            .order_by(JournalEntry.lesson_date)
        )).all()]
        summaries: list[tuple[Any, ...]] = [tuple(row) for row in (await session.execute(
            select(Journal.period_start, JournalStudentSummary.max_period_score, JournalStudentSummary.total_lessons,
                   JournalStudentSummary.sum_score, JournalStudentSummary.is_graded, JournalStudentSummary.version)
            .join(Journal, Journal.id == JournalStudentSummary.journal_id)
            .where(Journal.course_id == course_id, JournalStudentSummary.student_id == student_id)
            .order_by(Journal.period_start)
        )).all()]
        charges: list[tuple[Any, ...]] = [tuple(row) for row in (await session.execute(
            select(Charge.sequence_no, Charge.amount, Charge.due_date, Charge.status, Charge.type)
            .join(Enrollment, Enrollment.id == Charge.enrollment_id)
            .where(Enrollment.course_id == course_id, Enrollment.student_id == student_id)
            .order_by(Charge.sequence_no)
        )).all()]
        return entries, summaries, charges


@pytest.mark.asyncio
@pytest.mark.parametrize("exam_type", ["weekly", "monthly"])
async def test_copy_computes_dates_once_and_matches_ordinary_enrollment(
    db_session: AsyncSession, test_admin: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch, exam_type: str,
) -> None:
    source: Course = await CourseCopyFixture.source(db_session, test_mentor, 3)
    destination: CourseCreate = CourseCopyFixture.destination(test_mentor.id, "2026-12-31").model_copy(update={"exam_type": exam_type})
    calls: list[tuple[date, date]] = []
    original_calculate: Callable[[date, date, Collection[int]], tuple[date, ...]] = LessonDateCalculator.calculate

    def calculate(start: date, end: date, weekdays: Collection[int]) -> tuple[date, ...]:
        calls.append((start, end))
        return original_calculate(start, end, weekdays)

    monkeypatch.setattr(LessonDateCalculator, "calculate", calculate)
    service: CourseService = CourseService(db_session)
    copied: Course = await service.copy_course(destination, source.id, test_admin)
    assert calls == [(destination.start_date, destination.end_date)]
    monkeypatch.setattr(LessonDateCalculator, "calculate", original_calculate)
    source_student_id: int = (await db_session.execute(select(Enrollment.student_id).where(Enrollment.course_id == source.id).order_by(Enrollment.id).limit(1))).scalar_one()
    ordinary: Course = await service.create_course(destination.model_copy(update={"title": "Ordinary"}), test_admin)
    await EnrollmentService(db_session).enroll_student(source_student_id, ordinary.id, test_admin)
    copied_snapshot: tuple[list[tuple[Any, ...]], ...] = await CourseCopySnapshot.capture(db_session, copied.id, source_student_id)
    ordinary_snapshot: tuple[list[tuple[Any, ...]], ...] = await CourseCopySnapshot.capture(db_session, ordinary.id, source_student_id)
    assert copied_snapshot == ordinary_snapshot
    assert copied_snapshot[2]
    assert all(charge[1] == Decimal("120.01") for charge in copied_snapshot[2])
    await db_session.commit()
    with pytest.raises(HTTPException) as error:
        await EnrollmentService(db_session).enroll_student(source_student_id, copied.id, test_admin)
    assert error.value.status_code == 409
    assert await CourseCopySnapshot.capture(db_session, copied.id, source_student_id) == copied_snapshot
    assert (await db_session.execute(select(func.count(Enrollment.id)).where(Enrollment.course_id == copied.id, Enrollment.student_id == source_student_id))).scalar_one() == 1


@pytest.mark.asyncio
async def test_unexpected_enrollment_failure_rolls_back_entire_api_copy(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source: Course = await CourseCopyFixture.source(db_session, test_mentor, 2)
    original_enroll: Callable[..., Any] = EnrollmentService.enroll_student
    attempts: list[int] = []

    async def enroll(service: EnrollmentService, student_id: int, course_id: int, current_user: User, **kwargs: Any) -> Enrollment:
        attempts.append(student_id)
        if len(attempts) == 2:
            raise HTTPException(status_code=400, detail="Unexpected enrollment failure")
        return await original_enroll(service, student_id, course_id, current_user, **kwargs)

    monkeypatch.setattr(EnrollmentService, "enroll_student", enroll)
    response: Response = await client.post(f"/api/v1/courses/{source.id}/copy/", json=CourseCopyFixture.destination(test_mentor.id).model_dump(mode="json"), headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"})
    assert response.status_code == 400
    assert len(attempts) == 2
    assert (await db_session.execute(select(func.count(Course.id)))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(Enrollment.id)))).scalar_one() == 2
    assert (await db_session.execute(select(func.count(Journal.id)))).scalar_one() == 0
    assert (await db_session.execute(select(func.count(Charge.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_missing_source_copy_has_no_destination_writes(db_session: AsyncSession, test_admin: User, test_mentor: User) -> None:
    with pytest.raises(HTTPException) as error:
        await CourseService(db_session).copy_course(CourseCopyFixture.destination(test_mentor.id), 999999, test_admin)
    assert error.value.status_code == 404
    assert (await db_session.execute(select(func.count(Course.id)))).scalar_one() == 0
