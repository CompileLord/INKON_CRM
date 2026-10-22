from datetime import date
from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


class FutureLessonCounts:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def for_student_by_course(self, student_id: int, today: date) -> dict[int, tuple[int, int]]:
        rows: list[Row] = list((await self.session.execute(
            select(
                Journal.course_id,
                func.count(JournalEntry.id),
                func.count(JournalEntry.id).filter(JournalEntry.attendance.is_(True)),
            )
            .select_from(JournalEntry)
            .join(Journal, Journal.id == JournalEntry.journal_id)
            .join(JournalStudentSummary, (JournalStudentSummary.journal_id == JournalEntry.journal_id)
                  & (JournalStudentSummary.student_id == JournalEntry.student_id))
            .where(
                JournalEntry.student_id == student_id,
                JournalEntry.lesson_date > today,
                JournalStudentSummary.is_graded.is_(True),
            )
            .group_by(Journal.course_id)
        )).all())
        return {row[0]: (int(row[1]), int(row[2])) for row in rows}

    async def for_journals(self, journal_ids: list[int], today: date) -> tuple[int, int]:
        row: Row = (await self.session.execute(
            select(
                func.count(JournalEntry.id),
                func.count(JournalEntry.id).filter(JournalEntry.attendance.is_(True)),
            )
            .select_from(JournalEntry)
            .join(JournalStudentSummary, (JournalStudentSummary.journal_id == JournalEntry.journal_id)
                  & (JournalStudentSummary.student_id == JournalEntry.student_id))
            .where(
                JournalEntry.journal_id.in_(journal_ids),
                JournalEntry.lesson_date > today,
                JournalStudentSummary.is_graded.is_(True),
            )
        )).one()
        return int(row[0]), int(row[1])
