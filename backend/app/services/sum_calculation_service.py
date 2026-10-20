from typing import Any
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.core.scoring import ScoringPolicy


class SumCalculationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db

    async def recalculate(self, journal_id: int, student_id: int) -> None:
        await self.recalculate_journal(journal_id, {student_id})

    async def recalculate_journal(self, journal_id: int, student_ids: set[int] | None = None) -> None:
        if student_ids is not None and not student_ids:
            return
        journal: Journal | None = await self.db.get(Journal, journal_id)
        if journal is None:
            return
        entries_query: Select[Any] = (
            select(
                JournalEntry.student_id,
                func.sum(JournalEntry.score),
                func.sum(case((JournalEntry.attendance.is_(True), 1), else_=0)),
                func.count(JournalEntry.id),
                func.count(JournalEntry.id).filter(JournalEntry.is_graded.is_(True)),
                func.count(JournalEntry.id).filter(JournalEntry.is_graded.is_(None)),
            )
            .where(JournalEntry.journal_id == journal_id)
            .group_by(JournalEntry.student_id)
        )
        summaries_query: Select[tuple[JournalStudentSummary]] = select(JournalStudentSummary).where(
            JournalStudentSummary.journal_id == journal_id
        )
        if student_ids is not None:
            entries_query = entries_query.where(JournalEntry.student_id.in_(student_ids))
            summaries_query = summaries_query.where(JournalStudentSummary.student_id.in_(student_ids))
        aggregates: dict[int, tuple[int, int, int, int, int]] = {
            student_id: (int(score or 0), int(attendance or 0), lessons, graded, unknown)
            for student_id, score, attendance, lessons, graded, unknown in (await self.db.execute(entries_query)).all()
        }
        summaries: dict[int, JournalStudentSummary] = {
            summary.student_id: summary for summary in (await self.db.execute(summaries_query)).scalars()
        }
        all_student_ids: set[int] = set(aggregates) | set(summaries) | (student_ids or set())
        student_id: int
        for student_id in all_student_ids:
            summary: JournalStudentSummary | None = summaries.get(student_id)
            if summary is None:
                summary = JournalStudentSummary(
                    journal_id=journal_id,
                    student_id=student_id,
                    homework_score=0,
                    attendance_score=0,
                    exam_score=0,
                    bonus_score=0,
                    sum_score=0,
                    max_period_score=0,
                    attendance_count=0,
                    total_lessons=0,
                    is_graded=False,
                )
                self.db.add(summary)
            score: int
            attendance: int
            lessons: int
            graded: int
            unknown: int
            score, attendance, lessons, graded, unknown = aggregates.get(student_id, (0, 0, 0, 0, 0))
            if summary.is_graded is not True:
                summary.is_graded = True if graded else None if unknown or summary.is_graded is None else False
            summary.homework_score = score
            summary.attendance_score = attendance * ScoringPolicy.ATTENDANCE_POINT_PER_LESSON
            summary.attendance_count = attendance
            summary.total_lessons = lessons
            summary.max_period_score = ScoringPolicy.max_period_score(
                lessons, journal.exam_max_score, journal.bonus_max_score
            )
            summary.sum_score = score + summary.attendance_score + summary.exam_score + summary.bonus_score
        await self.db.flush()
