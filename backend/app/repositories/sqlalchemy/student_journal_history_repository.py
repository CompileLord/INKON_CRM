from datetime import date
from typing import Any
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.repositories.interfaces.student_journal_history_repository import (
    StudentJournalHistoryRecord, StudentJournalHistorySlice, StudentJournalSummaryRecord,
)


class SQLAlchemyStudentJournalHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def has_enrollment(self, student_id: int, course_id: int) -> bool:
        return bool(await self._session.scalar(select(Enrollment.id).where(
            Enrollment.student_id == student_id, Enrollment.course_id == course_id, Enrollment.is_deleted.is_(False)
        ).limit(1)))

    async def has_upcoming(self, student_id: int, course_id: int | None, today: date) -> bool:
        statement: Select[Any] = select(Journal.id).where(Journal.period_start > today,
            select(Enrollment.id).where(Enrollment.student_id == student_id,
                Enrollment.course_id == Journal.course_id, Enrollment.is_deleted.is_(False)).correlate(Journal).exists())
        if course_id is not None:
            statement = statement.where(Journal.course_id == course_id)
        return bool(await self._session.scalar(select(statement.exists())))

    async def page(
        self, student_id: int, course_id: int | None, cutoff: date | None,
        last_period_start: date | None, last_journal_id: int | None, limit: int,
    ) -> StudentJournalHistorySlice:
        enrolled: Any = select(Enrollment.id).where(
            Enrollment.student_id == student_id, Enrollment.course_id == Journal.course_id,
            Enrollment.is_deleted.is_(False),
        ).correlate(Journal).exists()
        statement: Select[Any] = select(Journal, Course.title).join(Course, Course.id == Journal.course_id).where(enrolled)
        if course_id is not None:
            statement = statement.where(Journal.course_id == course_id)
        if cutoff is not None:
            statement = statement.where(Journal.period_start <= cutoff)
        if last_period_start is not None and last_journal_id is not None:
            statement = statement.where(or_(Journal.period_start < last_period_start,
                and_(Journal.period_start == last_period_start, Journal.id < last_journal_id)))
        rows: Any = (await self._session.execute(statement.order_by(Journal.period_start.desc(), Journal.id.desc()).limit(limit + 1))).all()
        selected: Any = rows[:limit]
        journal_ids: list[int] = [row[0].id for row in selected]
        summaries: dict[int, JournalStudentSummary] = {}
        if journal_ids:
            result: Any = await self._session.execute(select(JournalStudentSummary).where(
                JournalStudentSummary.student_id == student_id, JournalStudentSummary.journal_id.in_(journal_ids)
            ))
            summaries = {summary.journal_id: summary for summary in result.scalars()}
        records: list[StudentJournalHistoryRecord] = []
        journal: Journal
        title: str
        for journal, title in selected:
            summary: JournalStudentSummary | None = summaries.get(journal.id)
            raw_summary: StudentJournalSummaryRecord | None = None
            if summary is not None:
                raw_summary = StudentJournalSummaryRecord(summary.homework_score, summary.attendance_score,
                    summary.exam_score, summary.bonus_score, summary.sum_score, summary.max_period_score,
                    summary.attendance_count, summary.total_lessons, summary.is_graded)
            records.append(StudentJournalHistoryRecord(journal.id, journal.course_id, title, journal.period_label,
                journal.period_start, journal.period_end, raw_summary))
        return StudentJournalHistorySlice(records=records, has_more=len(rows) > limit)
