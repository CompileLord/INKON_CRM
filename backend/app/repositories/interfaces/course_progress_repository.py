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
    color_hex: Optional[str] = None
    is_active: bool = True


@dataclass(frozen=True)
class ProgressSummaryRecord:
    student_id: int
    journal_id: int
    sum_score: int
    max_period_score: int
    is_graded: Optional[bool] = None


@dataclass(frozen=True)
class CourseProgressSnapshot:
    course_id: int
    periods: List[ProgressPeriodRecord]
    students: List[ProgressStudentRecord]
    summaries: List[ProgressSummaryRecord]


@dataclass(frozen=True)
class ChartStudentAggregate:
    student_id: int
    mean_percentage: float
    mean_score: float
    mean_maximum: float
    eligible_count: int


@dataclass(frozen=True)
class ChartPeriodAggregate:
    journal_id: int
    mean_percentage: float
    eligible_count: int


@dataclass(frozen=True)
class CourseChartSnapshot:
    progress: CourseProgressSnapshot
    student_aggregates: List[ChartStudentAggregate]
    period_aggregates: List[ChartPeriodAggregate]
    ranks: dict[int, int]
    class_mean: Optional[float]


class CourseProgressRepositoryInterface(Protocol):
    async def get_course_access_record(self, course_id: int) -> Optional[CourseAccessRecord]:
        ...

    async def get_course_progress_snapshot(
        self,
        course_id: int,
        always_include_student_id: Optional[int] = None
    ) -> CourseProgressSnapshot:
        ...

    async def get_course_chart_snapshot(
        self, course_id: int, student_id: Optional[int] = None
    ) -> CourseChartSnapshot:
        ...
