from datetime import date, datetime
from typing import Optional
from typing import Any
from pydantic import BaseModel, Field, model_validator
from app.models.notification_log import NotificationLog
from app.models.notification_log import NotificationStatus, NotificationType


class NotificationResponse(BaseModel):
    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def project_delivery_status(cls, value: Any) -> Any:
        if isinstance(value, NotificationLog):
            fields: dict[str, Any] = {name: getattr(value, name) for name in cls.model_fields}
            fields["status"] = value.delivery_state or value.status
            return fields
        return value

    id: int
    user_id: Optional[int] = None
    recipient: str
    type: NotificationType
    related_entity_id: int
    notification_date: date
    status: NotificationStatus = Field(
        description="Sent confirms provider success. Delivery is at least once: a crash after sending but before finalization can cause a duplicate after lease recovery."
    )
    attempts: int = 0
    sent_at: datetime
    read_at: Optional[datetime] = None


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkAllReadResponse(BaseModel):
    updated_count: int


class DeliveryLogResponse(BaseModel):
    id: int
    recipient_name: Optional[str] = None
    type: NotificationType
    notification_date: date
    status: NotificationStatus = Field(
        description="Sent confirms provider success. Delivery is at least once: a crash after sending but before finalization can cause a duplicate after lease recovery."
    )
    attempts: int
    sent_at: Optional[datetime] = None
    student_id: Optional[int] = None
    course_id: Optional[int] = None
    course_title: Optional[str] = None
    amount: Optional[str] = None
    score: Optional[int] = None
