from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class StudentJournalSummaryRecord:
    homework_score: int
    attendance_score: int
    exam_score: int
    bonus_score: int
    sum_score: int
    max_period_score: int
    attendance_count: int
    total_lessons: int
    is_graded: bool | None


@dataclass(frozen=True)
class StudentJournalHistoryRecord:
    journal_id: int
    course_id: int
    course_title: str
    period_label: str
    period_start: date
    period_end: date
    summary: StudentJournalSummaryRecord | None


@dataclass(frozen=True)
class StudentJournalHistorySlice:
    records: list[StudentJournalHistoryRecord]
    has_more: bool


class StudentJournalHistoryRepository(Protocol):
    async def has_enrollment(self, student_id: int, course_id: int) -> bool: ...

    async def has_upcoming(self, student_id: int, course_id: int | None, today: date) -> bool: ...

    async def page(
        self, student_id: int, course_id: int | None, cutoff: date | None,
        last_period_start: date | None, last_journal_id: int | None, limit: int,
    ) -> StudentJournalHistorySlice: ...
