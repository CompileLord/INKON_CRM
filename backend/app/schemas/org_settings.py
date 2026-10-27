from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.schemas.common import CanonicalPhone


class OrgSettingsResponse(BaseModel):
    org_name: str
    address: str | None = None
    phone: str | None = None
    notify_payments: bool
    notify_debts: bool
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class OrgSettingsUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    org_name: Optional[str] = Field(None, min_length=1, max_length=255)
    address: str | None = Field(None, max_length=255)
    phone: CanonicalPhone | None = None
    notify_payments: Optional[bool] = None
    notify_debts: Optional[bool] = None
