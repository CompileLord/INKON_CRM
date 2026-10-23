from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.user import User
from app.repositories.interfaces.journal_cell_lookup import JournalCellLookup


class SQLAlchemyJournalCellLookup:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def lookup(self, journal: Journal, student_ids: frozenset[int]) -> JournalCellLookup:
        weekdays: list[int] = list((await self.session.execute(
            select(CourseSchedule.day_of_week).where(CourseSchedule.course_id == journal.course_id)
        )).scalars().all())
        known: list[int] = list((await self.session.execute(
            select(User.id).where(User.id.in_(student_ids))
        )).scalars().all())
        enrolled: list[int] = list((await self.session.execute(
            select(Enrollment.student_id).where(
                Enrollment.course_id == journal.course_id,
                Enrollment.student_id.in_(student_ids),
                Enrollment.is_deleted.is_(False),
                Enrollment.status == EnrollmentStatus.ACTIVE,
            )
        )).scalars().all())
        return JournalCellLookup(tuple(weekdays), frozenset(known), frozenset(enrolled))
