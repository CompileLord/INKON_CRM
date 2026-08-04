from datetime import date
from typing import Optional
from pydantic import BaseModel, Field
from app.models.journal import JournalPeriodType


class JournalResponse(BaseModel):
    id: int
    course_id: int
    period_label: str
    period_start: date
    period_end: date
    period_type: JournalPeriodType
    exam_max_score: int
    student_count: int = 0
    lesson_count: int = 0
    cells_expected: int = 0
    cells_filled: int = 0
    avg_percentage: Optional[float] = None
    state: str = "empty"

    model_config = {"from_attributes": True}


class CourseJournalMetricsResponse(BaseModel):
    class_avg_percentage: float
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


class JournalEntryUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    lesson_date: date
    attendance: bool
    score: int = Field(ge=0, le=5)
    comment: Optional[str] = None
    version: int


class JournalStudentSummaryUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    exam_score: int = Field(ge=0)
    bonus_score: int = Field(ge=0)
    version: int


class JournalExamMaxScoreUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    exam_max_score: int = Field(ge=0, le=100)


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

