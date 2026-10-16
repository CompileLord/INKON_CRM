from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel
from app.models.notification_log import NotificationStatus, NotificationType


class NotificationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    user_id: Optional[int] = None
    recipient: str
    type: NotificationType
    related_entity_id: int
    notification_date: date
    status: NotificationStatus
    attempts: int = 0
    sent_at: Optional[datetime] = None
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
    status: NotificationStatus
    attempts: int
    sent_at: Optional[datetime] = None
