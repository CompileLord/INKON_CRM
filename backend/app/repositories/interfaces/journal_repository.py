from datetime import date
from dataclasses import dataclass
from typing_extensions import Protocol
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class JournalClassStatistics:
    average_percentage: float
    average_score: float
    student_rank: int


@dataclass(frozen=True)
class MentorJournalBatch:
    courses: tuple[Course, ...]
    journals: tuple[Journal, ...]
    schedules: tuple[CourseSchedule, ...]
    student_counts: dict[int, int]
    graded_entry_counts: dict[int, int]


class JournalRepository(BaseRepository[Journal], Protocol):
    async def get_mentor_journal_batch(self, mentor_id: int, today: date) -> MentorJournalBatch:
        ...

    async def get_class_statistics(self, journal_id: int, student_id: int) -> JournalClassStatistics:
        ...
