from datetime import date
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.user import StudentJournalPeriodResponse


class StudentJournalHistoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_size: int = Field(default=20, ge=1, le=100)
    course_id: int | None = Field(default=None, gt=0)
    started_only: bool = False
    cursor: str | None = Field(default=None, min_length=1, max_length=1024)


class StudentJournalHistoryCursorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: int = Field(default=1, ge=1, le=1)
    student_id: int = Field(gt=0)
    course_id: int | None = Field(default=None, gt=0)
    started_only: bool
    cutoff: date | None
    last_period_start: date
    last_journal_id: int = Field(gt=0)

    @model_validator(mode="after")
    def validate_cutoff(self) -> "StudentJournalHistoryCursorPayload":
        if self.started_only != (self.cutoff is not None):
            raise ValueError("Invalid history cutoff")
        if self.cutoff is not None and self.last_period_start > self.cutoff:
            raise ValueError("Invalid history position")
        return self


class StudentJournalHistoryPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[StudentJournalPeriodResponse]
    next_cursor: str | None
    has_upcoming_periods: bool
