from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.core.scoring import ATTENDANCE_POINT_PER_LESSON, max_period_score


class SumCalculationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def recalculate(self, journal_id: int, student_id: int) -> None:
        journal_result = await self.db.execute(select(Journal).filter(Journal.id == journal_id))
        journal = journal_result.scalars().first()
        exam_max_score_val = journal.exam_max_score if journal else 70

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
                homework_score=0,
                attendance_score=0,
                exam_score=0,
                bonus_score=0,
                sum_score=0,
                max_period_score=0,
                attendance_count=0,
                total_lessons=0,
                version=1
            )
            self.db.add(summary)

        summary.homework_score = daily_scores_sum
        summary.attendance_score = attendance_count * ATTENDANCE_POINT_PER_LESSON
        summary.attendance_count = attendance_count
        summary.total_lessons = total_lessons
        summary.max_period_score = max_period_score(total_lessons, exam_max_score_val)
        summary.sum_score = summary.homework_score + summary.attendance_score + summary.exam_score + summary.bonus_score

        await self.db.flush()

    async def recalculate_journal(self, journal_id: int) -> None:
        journal_result = await self.db.execute(select(Journal).filter(Journal.id == journal_id))
        journal = journal_result.scalars().first()
        if not journal:
            return

        exam_max_score_val = journal.exam_max_score

        entries_result = await self.db.execute(
            select(JournalEntry).filter(JournalEntry.journal_id == journal_id)
        )
        entries = list(entries_result.scalars().all())

        entries_by_student: dict[int, list[JournalEntry]] = {}
        for entry in entries:
            entries_by_student.setdefault(entry.student_id, []).append(entry)

        summaries_result = await self.db.execute(
            select(JournalStudentSummary).filter(JournalStudentSummary.journal_id == journal_id)
        )
        summaries = list(summaries_result.scalars().all())
        summaries_by_student: dict[int, JournalStudentSummary] = {s.student_id: s for s in summaries}

        all_student_ids = set(entries_by_student.keys()) | set(summaries_by_student.keys())

        for student_id in all_student_ids:
            student_entries = entries_by_student.get(student_id, [])
            homework_score = sum(e.score for e in student_entries)
            attendance_count = sum(1 for e in student_entries if e.attendance is True)
            attendance_score = attendance_count * ATTENDANCE_POINT_PER_LESSON
            total_lessons = len(student_entries)

            summary = summaries_by_student.get(student_id)
            if not summary:
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
                    version=1
                )
                self.db.add(summary)
                summaries_by_student[student_id] = summary

            summary.homework_score = homework_score
            summary.attendance_score = attendance_score
            summary.attendance_count = attendance_count
            summary.total_lessons = total_lessons
            summary.max_period_score = max_period_score(total_lessons, exam_max_score_val)
            summary.sum_score = homework_score + attendance_score + summary.exam_score + summary.bonus_score

        await self.db.flush()
