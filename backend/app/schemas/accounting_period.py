from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.accounting_period import AccountingPeriodStatus


class AccountingPeriodResponse(BaseModel):
    id: int
    year: int
    month: int
    status: AccountingPeriodStatus
    closed_by_id: Optional[int] = None
    closed_at: Optional[datetime] = None
    reopen_reason: Optional[str] = None


class ClosePeriodPayload(BaseModel):
    model_config = {"extra": "forbid"}
    comment: Optional[str] = None


class ReopenPeriodPayload(BaseModel):
    model_config = {"extra": "forbid"}
    reason_code: str = Field(..., min_length=1, max_length=100)
