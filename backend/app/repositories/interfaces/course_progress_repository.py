from dataclasses import dataclass
from datetime import date
from typing import List, Optional
from typing_extensions import Protocol


@dataclass(frozen=True)
class CourseAccessRecord:
    id: int
    mentor_id: Optional[int]
    is_deleted: bool


@dataclass(frozen=True)
class ProgressPeriodRecord:
    id: int
    period_label: str
    period_start: date
    period_end: date


@dataclass(frozen=True)
class ProgressStudentRecord:
    student_id: int
    first_name: str
    last_name: str


@dataclass(frozen=True)
class ProgressSummaryRecord:
    student_id: int
    journal_id: int
    sum_score: int
    max_period_score: int


@dataclass(frozen=True)
class CourseProgressSnapshot:
    course_id: int
    periods: List[ProgressPeriodRecord]
    students: List[ProgressStudentRecord]
    summaries: List[ProgressSummaryRecord]


class CourseProgressRepositoryInterface(Protocol):
    async def get_course_access_record(self, course_id: int) -> Optional[CourseAccessRecord]:
        ...

    async def get_course_progress_snapshot(self, course_id: int) -> CourseProgressSnapshot:
        ...
