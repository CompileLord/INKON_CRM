from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class DebtReminderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_ids: Annotated[list[Annotated[StrictInt, Field(gt=0)]], Field(min_length=1, max_length=100)]

    @field_validator("student_ids")
    @classmethod
    def require_unique_students(cls, student_ids: list[int]) -> list[int]:
        if len(set(student_ids)) != len(student_ids):
            raise ValueError("student_ids must be unique")
        return student_ids


class DebtReminderResult(BaseModel):
    student_id: int
    outcome: Literal["queued", "no_parent_chat", "no_debt", "recently_reminded", "not_found", "no_channel"]
    channel: Literal["telegram", "sms"] | None = None
    masked_destination: str | None = None
    next_allowed_at: datetime | None


class DebtReminderResponse(BaseModel):
    results: list[DebtReminderResult]
