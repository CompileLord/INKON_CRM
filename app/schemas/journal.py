from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


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


class JournalStudentSummaryResponse(BaseModel):
    id: int
    journal_id: int
    student_id: int
    exam_score: int
    bonus_score: int
    sum_score: int
    attendance_count: int
    total_lessons: int
    version: int
