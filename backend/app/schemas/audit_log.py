from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.audit_log import AuditAction


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: AuditAction
    entity_type: str
    entity_id: int
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    created_at: datetime
