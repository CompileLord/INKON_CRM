from datetime import date, datetime
from enum import Enum
from typing import Optional
from sqlalchemy import Date, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class NotificationType(str, Enum):
    PAYMENT_REMINDER_2D = "payment_reminder_2d"
    PAYMENT_REMINDER_1D = "payment_reminder_1d"
    EXAM_RESULT = "exam_result"


class NotificationStatus(str, Enum):
    SENT = "sent"
    FAILED = "failed"


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    __table_args__ = (
        UniqueConstraint("recipient", "type", "related_entity_id", "notification_date", name="uq_notification_log"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[NotificationType] = mapped_column(String(50), nullable=False)
    related_entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    notification_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(String(20), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
