from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary


class SumCalculationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def recalculate(self, journal_id: int, student_id: int) -> None:
        entries_query = select(JournalEntry).filter(
            JournalEntry.journal_id == journal_id,
            JournalEntry.student_id == student_id
        )
        entries_result = await self.db.execute(entries_query)
        entries = list(entries_result.scalars().all())

        daily_scores_sum = sum(e.score for e in entries)
        attendance_count = sum(1 for e in entries if e.attendance is True)
        total_lessons = len(entries)

        summary_query = select(JournalStudentSummary).filter(
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.student_id == student_id
        )
        summary_result = await self.db.execute(summary_query)
        summary = summary_result.scalars().first()

        if not summary:
            summary = JournalStudentSummary(
                journal_id=journal_id,
                student_id=student_id,
                exam_score=0,
                bonus_score=0,
                sum_score=0,
                attendance_count=0,
                total_lessons=0,
                version=1
            )
            self.db.add(summary)

        # In standard SQL education center math:
        summary.sum_score = daily_scores_sum + summary.exam_score + summary.bonus_score
        summary.attendance_count = attendance_count
        summary.total_lessons = total_lessons

        await self.db.flush()
