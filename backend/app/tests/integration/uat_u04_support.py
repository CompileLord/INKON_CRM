from dataclasses import dataclass
from datetime import date, time, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.core.security import create_access_token
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole


@dataclass
class JournalWorld:
    mentor: User
    admin: User
    student: User
    other_student: User
    outsider: User
    course: Course
    journal: Journal
    past_dates: list[date]
    future_dates: list[date]
    skipped_date: date


class JournalWorldBuilder:
    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    async def build(session: AsyncSession, mentor: User, admin: User, student: User) -> JournalWorld:
        today: date = SchoolCalendar.today()
        other_student: User = User(first_name="Other", last_name="Student", role=UserRole.STUDENT, email="other-u04@example.com")
        outsider: User = User(first_name="Out", last_name="Sider", role=UserRole.STUDENT, email="outsider-u04@example.com")
        session.add_all([other_student, outsider])
        await session.flush()
        skipped_date: date = today - timedelta(days=1)
        course: Course = Course(
            title="U04 course", description="U04", mentor_id=mentor.id,
            start_date=today - timedelta(days=4), end_date=today + timedelta(days=3),
            exam_type="weekly", price=Decimal("100.00"),
        )
        session.add(course)
        await session.flush()
        weekday: int
        session.add_all([
            CourseSchedule(course_id=course.id, day_of_week=weekday, time_start=time(9), time_end=time(10))
            for weekday in range(7) if weekday != skipped_date.weekday()
        ])
        journal: Journal = Journal(
            course_id=course.id, period_label="U04", period_start=today - timedelta(days=4),
            period_end=today + timedelta(days=3), period_type="week",
        )
        session.add(journal)
        await session.flush()
        offsets: list[int] = [-4, -3, -2, 0, 1, 2, 3]
        past_dates: list[date] = [today + timedelta(days=offset) for offset in offsets if offset <= 0]
        future_dates: list[date] = [today + timedelta(days=offset) for offset in offsets if offset > 0]
        enrolled: User
        for enrolled in (student, other_student):
            session.add(Enrollment(student_id=enrolled.id, course_id=course.id, price_at_enrollment=Decimal("100.00"), color_hex="#123456"))
            lesson_date: date
            for lesson_date in past_dates + future_dates:
                session.add(JournalEntry(
                    journal_id=journal.id, student_id=enrolled.id, lesson_date=lesson_date,
                    attendance=False, score=0, is_graded=False,
                ))
            session.add(JournalStudentSummary(
                journal_id=journal.id, student_id=enrolled.id, homework_score=0, attendance_score=0,
                exam_score=0, bonus_score=0, sum_score=0, max_period_score=100,
                attendance_count=0, total_lessons=len(past_dates) + len(future_dates), is_graded=True,
            ))
        await session.commit()
        return JournalWorld(mentor, admin, student, other_student, outsider, course, journal, past_dates, future_dates, skipped_date)


class CellPayload:
    @staticmethod
    def build(student_id: int, lesson_date: date, version: int = 1, score: int = 4) -> dict[str, Any]:
        return {
            "student_id": student_id, "lesson_date": lesson_date.isoformat(),
            "attendance": True, "score": score, "comment": None, "version": version,
        }


@pytest.fixture
async def world(db_session: AsyncSession, test_mentor: User, test_admin: User, test_student: User) -> JournalWorld:
    return await JournalWorldBuilder.build(db_session, test_mentor, test_admin, test_student)


@pytest.fixture
def world_journal() -> Journal:
    today: date = SchoolCalendar.today()
    return Journal(
        id=1, course_id=1, period_label="started", period_start=today - timedelta(days=3),
        period_end=today + timedelta(days=3), period_type="week", exam_max_score=70,
    )


