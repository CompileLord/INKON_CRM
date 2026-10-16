from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.audit_log import AuditAction


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    actor_name: Optional[str] = None
    action: AuditAction
    entity_type: str
    entity_id: int
    entity_label: Optional[str] = None
    student_id: Optional[int] = None
    course_id: Optional[int] = None
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    created_at: datetime


class AuditChangeResponse(BaseModel):
    id: int
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]


class AuditEventResponse(BaseModel):
    id: int
    user_id: Optional[int]
    actor_name: Optional[str] = None
    action: AuditAction
    entity_type: str
    entity_id: int
    entity_label: Optional[str] = None
    student_id: Optional[int] = None
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    amount: Optional[str] = None
    created_at: datetime
    changes: list[AuditChangeResponse]


class AuditActorResponse(BaseModel):
    id: int
    name: str


class AuditFilterOptionsResponse(BaseModel):
    actors: list[AuditActorResponse]
    entity_types: list[str]
