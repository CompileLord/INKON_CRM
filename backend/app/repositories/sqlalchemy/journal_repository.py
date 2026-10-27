from datetime import date
from typing import Optional
from sqlalchemy import case, func, select
from sqlalchemy.engine import Result, Row
from sqlalchemy.sql import Select, ColumnElement
from sqlalchemy.sql.selectable import Subquery
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.school_calendar import SchoolCalendar
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal_entry import JournalEntry
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.repositories.interfaces.journal_repository import JournalClassStatistics, JournalRepository, MentorJournalBatch
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyJournalRepository(SQLAlchemyBaseRepository[Journal], JournalRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Journal, session)

    async def get_mentor_journal_batch(self, mentor_id: int, today: date) -> MentorJournalBatch:
        courses_result: Result = await self.session.execute(select(Course).where(
            Course.mentor_id == mentor_id, Course.status == CourseStatus.ACTIVE, Course.is_deleted.is_(False),
        ))
        courses: tuple[Course, ...] = tuple(courses_result.scalars().all())
        if not courses:
            return MentorJournalBatch((), (), (), {}, {})
        course_ids: list[int] = [course.id for course in courses]
        journals_result: Result = await self.session.execute(select(Journal).where(
            Journal.course_id.in_(course_ids),
        ).order_by(Journal.period_start.asc()))
        journals: tuple[Journal, ...] = tuple(journals_result.scalars().all())
        schedules_result: Result = await self.session.execute(select(CourseSchedule).where(
            CourseSchedule.course_id.in_(course_ids),
        ))
        schedules: tuple[CourseSchedule, ...] = tuple(schedules_result.scalars().all())
        students_result: Result = await self.session.execute(select(
            Enrollment.course_id, func.count(Enrollment.id),
        ).join(User, User.id == Enrollment.student_id).where(
            Enrollment.course_id.in_(course_ids), Enrollment.is_deleted.is_(False),
            Enrollment.status == EnrollmentStatus.ACTIVE, User.is_deleted.is_(False),
        ).group_by(Enrollment.course_id))
        row: Row
        student_counts: dict[int, int] = {row[0]: row[1] for row in students_result.all()}
        entries_result: Result = await self.session.execute(select(
            JournalEntry.journal_id, func.count(JournalEntry.id),
        ).join(Journal, Journal.id == JournalEntry.journal_id).join(User, User.id == JournalEntry.student_id).join(
            Enrollment, (Enrollment.course_id == Journal.course_id) & (Enrollment.student_id == JournalEntry.student_id),
        ).where(
            Journal.course_id.in_(course_ids), Journal.period_start <= today, JournalEntry.lesson_date <= today,
            JournalEntry.is_graded.is_(True), User.is_deleted.is_(False),
            Enrollment.is_deleted.is_(False), Enrollment.status == EnrollmentStatus.ACTIVE,
        ).group_by(JournalEntry.journal_id))
        graded_entry_counts: dict[int, int] = {row[0]: row[1] for row in entries_result.all()}
        return MentorJournalBatch(courses, journals, schedules, student_counts, graded_entry_counts)

    async def get_class_statistics(self, journal_id: int, student_id: int) -> JournalClassStatistics:
        eligible: tuple[ColumnElement, ...] = (
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.is_graded.is_(True),
            Journal.period_start <= SchoolCalendar.today(),
            User.is_deleted.is_(False),
            Enrollment.is_deleted.is_(False),
            Enrollment.status == EnrollmentStatus.ACTIVE,
        )
        averages_result: Result = await self.session.execute(select(
            func.avg(case((
                JournalStudentSummary.max_period_score > 0,
                JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score,
            ))),
            func.avg(JournalStudentSummary.sum_score),
        ).join(Journal, Journal.id == JournalStudentSummary.journal_id).join(User, User.id == JournalStudentSummary.student_id).join(
            Enrollment, (Enrollment.course_id == Journal.course_id) & (Enrollment.student_id == JournalStudentSummary.student_id),
        ).where(*eligible))
        averages: Row = averages_result.one()
        ranked_students: Subquery = select(
            JournalStudentSummary.student_id.label("student_id"),
            func.row_number().over(order_by=(
                (JournalStudentSummary.sum_score * 100.0 / JournalStudentSummary.max_period_score).desc(),
                JournalStudentSummary.student_id.asc(),
            )).label("student_rank"),
        ).join(Journal, Journal.id == JournalStudentSummary.journal_id).join(User, User.id == JournalStudentSummary.student_id).join(
            Enrollment, (Enrollment.course_id == Journal.course_id) & (Enrollment.student_id == JournalStudentSummary.student_id),
        ).where(
            *eligible, JournalStudentSummary.max_period_score > 0,
        ).subquery()
        rank_result: Result = await self.session.execute(
            select(ranked_students.c.student_rank).where(ranked_students.c.student_id == student_id)
        )
        student_rank: Optional[int] = rank_result.scalar_one_or_none()
        return JournalClassStatistics(
            average_percentage=round(float(averages[0]), 1) if averages[0] is not None else 0.0,
            average_score=round(float(averages[1]), 1) if averages[1] is not None else 0.0,
            student_rank=int(student_rank) if student_rank is not None else 0,
        )
