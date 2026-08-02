from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class OrgSettingsResponse(BaseModel):
    org_name: str
    notify_payments: bool
    notify_debts: bool
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class OrgSettingsUpdate(BaseModel):
    org_name: Optional[str] = Field(None, min_length=1, max_length=255)
    notify_payments: Optional[bool] = None
    notify_debts: Optional[bool] = None
