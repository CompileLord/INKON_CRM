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
    error_message: Optional[str] = None


class UnreadCountResponse(BaseModel):
    unread_count: int
