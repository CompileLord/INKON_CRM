from datetime import date
from typing import Annotated, ClassVar, List, Optional, TypeAlias
from pydantic import AfterValidator, BaseModel, Field, field_validator, model_validator
from app.core.scoring import ScoringPolicy
from app.models.journal import JournalPeriodType


class JournalResponse(BaseModel):
    id: int
    course_id: int
    period_label: str
    period_start: date
    period_end: date
    period_type: JournalPeriodType
    exam_max_score: int
    bonus_max_score: int = ScoringPolicy.DEFAULT_BONUS_MAX_SCORE
    student_count: int = 0
    lesson_count: int = 0
    cells_expected: int = 0
    cells_filled: int = 0
    avg_percentage: Optional[float] = None
    avg_score: Optional[float] = None
    state: str = "empty"

    @field_validator("bonus_max_score", mode="before")
    @classmethod
    def default_missing_bonus_max_score(cls, value: Optional[int]) -> int:
        return ScoringPolicy.resolve_bonus_max_score(value)

    model_config = {"from_attributes": True}


class CourseJournalMetricsResponse(BaseModel):
    class_avg_percentage: float
    class_avg_score: float = 0.0
    class_avg_max_score: float = 0.0
    attendance_rate: float
    periods_total: int
    periods_complete: int
    at_risk_count: int
    at_risk_threshold: int = 60


class GradingQueueItemResponse(BaseModel):
    journal_id: int
    course_id: int
    course_title: str
    period_label: str
    period_start: date
    period_end: date
    state: str
    cells_filled: int
    cells_expected: int
    is_current: bool


class JournalAutosavePolicy:
    MAX_CELLS: ClassVar[int] = 250
    MAX_COMMENT_CHARACTERS: ClassVar[int] = 1000

    @staticmethod
    def validate_unique(entries: list["JournalEntryUpdate"]) -> list["JournalEntryUpdate"]:
        keys: set[tuple[int, date]] = set()
        entry: JournalEntryUpdate
        for entry in entries:
            key: tuple[int, date] = (entry.student_id, entry.lesson_date)
            if key in keys:
                raise ValueError("Duplicate student/date cells are not allowed")
            keys.add(key)
        return entries


class JournalEntryUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    lesson_date: date
    attendance: bool
    score: int = Field(ge=0, le=5)
    comment: Optional[str] = Field(default=None, max_length=JournalAutosavePolicy.MAX_COMMENT_CHARACTERS)
    version: int


JournalEntryBatchUpdate: TypeAlias = Annotated[
    list[JournalEntryUpdate],
    Field(max_length=JournalAutosavePolicy.MAX_CELLS),
    AfterValidator(JournalAutosavePolicy.validate_unique),
]


class JournalStudentSummaryUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    exam_score: int = Field(ge=0)
    bonus_score: int = Field(ge=0)
    version: int


class JournalExamMaxScoreUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    exam_max_score: Optional[int] = Field(default=None, ge=0, le=ScoringPolicy.EXAM_MAX_SCORE_LIMIT)
    bonus_max_score: Optional[int] = Field(default=None, ge=0, le=ScoringPolicy.BONUS_MAX_SCORE_LIMIT)

    @model_validator(mode="after")
    def require_at_least_one_maximum(self) -> "JournalExamMaxScoreUpdate":
        if self.exam_max_score is None and self.bonus_max_score is None:
            raise ValueError("exam_max_score or bonus_max_score is required")
        return self


class JournalStudentSummaryResponse(BaseModel):
    id: int
    journal_id: int
    student_id: int
    homework_score: int
    attendance_score: int
    exam_score: int
    bonus_score: int
    sum_score: int
    max_period_score: int
    percentage: float
    attendance_count: int
    total_lessons: int
    version: int

    model_config = {"from_attributes": True}


class JournalEntryStateResponse(BaseModel):
    student_id: int
    lesson_date: date
    attendance: bool
    score: int
    comment: Optional[str] = None
    version: int

    model_config = {"from_attributes": True}


class JournalEntryConflictResponse(BaseModel):
    student_id: int
    lesson_date: date
    submitted_version: int
    current: Optional[JournalEntryStateResponse] = None


class JournalBatchUpdateResponse(BaseModel):
    applied: list[JournalEntryStateResponse]
    conflicts: list[JournalEntryConflictResponse]
    summaries: list[JournalStudentSummaryResponse]


class JournalExamMaxScoreUpdateResponse(BaseModel):
    journal: JournalResponse
    summaries: list[JournalStudentSummaryResponse]



class ClassJournalEntryResponse(BaseModel):
    id: int
    lesson_date: date
    attendance: bool
    score: int
    comment: Optional[str] = None
    has_comment: bool = False
    version: int


class ClassJournalSummaryResponse(BaseModel):
    id: int
    journal_id: int
    student_id: int
    homework_score: int
    attendance_score: int
    exam_score: int
    bonus_score: int
    sum_score: int
    max_period_score: int
    percentage: float
    attendance_count: int
    total_lessons: int
    version: int


class ClassJournalStudentResponse(BaseModel):
    student_id: int
    first_name: str
    last_name: str
    color_hex: str
    is_self: bool
    entries: List[ClassJournalEntryResponse]
    summary: Optional[ClassJournalSummaryResponse] = None


class ClassJournalResponse(BaseModel):
    journal_id: int
    course_id: int
    period_label: str
    period_start: date
    period_end: date
    period_type: JournalPeriodType
    exam_max_score: int
    bonus_max_score: int = ScoringPolicy.DEFAULT_BONUS_MAX_SCORE
    lesson_dates: List[date]
    students: List[ClassJournalStudentResponse]
    my_rank: int
    class_size: int
    class_avg_percentage: float
    class_avg_score: float = 0.0
