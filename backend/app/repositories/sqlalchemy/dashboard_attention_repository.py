from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.user import User, UserRole


class DashboardAttentionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def lessons(self, today: date) -> list[Any]:
        marked: Any = select(JournalEntry.id).join(Journal, Journal.id == JournalEntry.journal_id).where(
            Journal.course_id == Course.id, JournalEntry.lesson_date == today, JournalEntry.is_graded.is_(True)
        ).exists()
        statement: Any = select(Course.id, Course.title, CourseSchedule.time_start, CourseSchedule.time_end,
            User.first_name, User.last_name, User.phone, Journal.id.label('journal_id'), marked.label('marked')).join(
            CourseSchedule, CourseSchedule.course_id == Course.id).join(User, User.id == Course.mentor_id).outerjoin(
            Journal, and_(Journal.course_id == Course.id, Journal.period_start <= today, Journal.period_end >= today)).where(
            Course.is_deleted.is_(False), Course.status == CourseStatus.ACTIVE, Course.start_date <= today,
            Course.end_date >= today, CourseSchedule.day_of_week == today.weekday()).order_by(CourseSchedule.time_start.desc(), Course.id)
        return list((await self.session.execute(statement)).all())

    async def absences(self, today: date) -> list[Any]:
        history: Any = select(Journal.course_id.label('course_id'), JournalEntry.student_id,
            JournalEntry.lesson_date, JournalEntry.attendance,
            func.sum(case((JournalEntry.attendance.is_(True), 1), else_=0)).over(
                partition_by=(Journal.course_id, JournalEntry.student_id), order_by=JournalEntry.lesson_date).label('present_group')
        ).join(Journal, Journal.id == JournalEntry.journal_id).where(
            JournalEntry.is_graded.is_(True), JournalEntry.lesson_date <= today).subquery()
        streaks: Any = select(history, func.count().filter(history.c.attendance.is_(False)).over(partition_by=(history.c.course_id, history.c.student_id,
            history.c.present_group), order_by=history.c.lesson_date).label('streak')).subquery()
        statement: Any = select(streaks.c.course_id, streaks.c.student_id, User.first_name, User.last_name, streaks.c.streak).join(
            Enrollment, and_(Enrollment.course_id == streaks.c.course_id, Enrollment.student_id == streaks.c.student_id)).join(
            User, User.id == streaks.c.student_id).where(streaks.c.lesson_date == today, streaks.c.attendance.is_(False),
            Enrollment.status == EnrollmentStatus.ACTIVE, Enrollment.is_deleted.is_(False), User.is_deleted.is_(False),
            User.role == UserRole.STUDENT).order_by(User.last_name, User.first_name, User.id)
        return list((await self.session.execute(statement)).all())

    async def payments(self, today: date) -> list[Any]:
        allocations: Any = select(Allocation.charge_id, func.sum(Allocation.amount).label('paid')).where(
            Allocation.reversed_by_entry_id.is_(None)).group_by(Allocation.charge_id).subquery()
        remaining: Any = Charge.amount - func.coalesce(allocations.c.paid, Decimal('0.00'))
        statement: Any = select(User.id, User.first_name, User.last_name, Course.id.label('course_id'), Course.title,
            Enrollment.id.label('enrollment_id'), Charge.due_date, func.sum(remaining).label('remaining')).select_from(Charge).join(
            Enrollment, Enrollment.id == Charge.enrollment_id).join(User, and_(User.id == Enrollment.student_id, Charge.student_id == User.id)).join(
            Course, Course.id == Enrollment.course_id).outerjoin(allocations, allocations.c.charge_id == Charge.id).where(
            Charge.is_deleted.is_(False), Charge.status == ChargeStatus.OPEN, Charge.due_date.between(today - timedelta(days=7), today),
            Enrollment.status == EnrollmentStatus.ACTIVE, Enrollment.is_deleted.is_(False), User.is_deleted.is_(False),
            User.role == UserRole.STUDENT, Course.is_deleted.is_(False), remaining > 0).group_by(
            User.id, User.first_name, User.last_name, Course.id, Course.title, Enrollment.id, Charge.due_date).order_by(
            Charge.due_date.desc(), Course.title, User.last_name, User.first_name, User.id)
        return list((await self.session.execute(statement)).all())
