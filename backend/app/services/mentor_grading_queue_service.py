from collections import defaultdict
from datetime import date
from typing import List
from app.core.schedule_utils import LessonDateCalculator
from app.core.school_calendar import SchoolCalendar
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.repositories.interfaces.journal_repository import JournalRepository, MentorJournalBatch
from app.schemas.journal import GradingQueueItemResponse


class MentorGradingQueueService:
    def __init__(self, journal_repository: JournalRepository) -> None:
        self.journal_repository: JournalRepository = journal_repository

    async def build(self, mentor_id: int) -> List[GradingQueueItemResponse]:
        today: date = SchoolCalendar.today()
        batch: MentorJournalBatch = await self.journal_repository.get_mentor_journal_batch(mentor_id, today)
        journals_by_course: dict[int, list[Journal]] = defaultdict(list)
        weekdays_by_course: dict[int, list[int]] = defaultdict(list)
        journal: Journal
        schedule: CourseSchedule
        course: Course
        for journal in batch.journals:
            journals_by_course[journal.course_id].append(journal)
        for schedule in batch.schedules:
            weekdays_by_course[schedule.course_id].append(schedule.day_of_week)
        queue: List[GradingQueueItemResponse] = []
        for course in batch.courses:
            for journal in journals_by_course[course.id]:
                if journal.period_start > today:
                    continue
                lesson_count: int = LessonDateCalculator.held_count(
                    journal.period_start, journal.period_end, weekdays_by_course[course.id], today,
                )
                cells_expected: int = batch.student_counts.get(course.id, 0) * lesson_count
                cells_filled: int = batch.graded_entry_counts.get(journal.id, 0)
                state: str = "empty" if cells_filled == 0 else "partial"
                if cells_expected > 0 and cells_filled >= cells_expected:
                    continue
                queue.append(GradingQueueItemResponse(
                    journal_id=journal.id,
                    course_id=course.id,
                    course_title=course.title,
                    period_label=journal.period_label,
                    period_start=journal.period_start,
                    period_end=journal.period_end,
                    state=state,
                    cells_filled=cells_filled,
                    cells_expected=cells_expected,
                    is_current=journal.period_start <= today <= journal.period_end,
                ))

        queue.sort(key=lambda item: (0 if item.is_current else 1, -item.period_end.toordinal()))
        return queue
