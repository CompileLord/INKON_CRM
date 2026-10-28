from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.user import User


class NotificationType(str, Enum):
    PAYMENT_REMINDER_2D = "payment_reminder_2d"
    PAYMENT_REMINDER_1D = "payment_reminder_1d"
    EXAM_RESULT = "exam_result"
    TELEGRAM_LINK_LOCKOUT = "telegram_link_lockout"


class NotificationStatus(str, Enum):
    QUEUED = "queued"
    INFLIGHT = "inflight"
    SENT = "sent"
    FAILED = "failed"


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    __table_args__ = (
        UniqueConstraint("recipient", "type", "related_entity_id", "notification_date", name="uq_notification_log"),
        Index("ix_notification_logs_user_id", "user_id"),
        Index("ix_notification_logs_read_at", "read_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[NotificationType] = mapped_column(String(50), nullable=False)
    related_entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    notification_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(String(20), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    revision_fingerprint: Mapped[Optional[str]] = mapped_column(String(35), nullable=True)
    source_journal_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    delivery_state: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    delivery_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_terminal: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False, server_default="false")
    revision: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1, server_default="1")
    delivery_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    delivery_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    claim_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[Optional[User]] = relationship("User")


class ExamNotificationBaseline(Base):
    __tablename__ = "exam_notification_baselines"

    recipient: Mapped[str] = mapped_column(String(255), primary_key=True)
    summary_id: Mapped[int] = mapped_column(
        ForeignKey("journal_student_summaries.id", ondelete="CASCADE"), primary_key=True
    )
    observed_fingerprint: Mapped[Optional[str]] = mapped_column(String(35), nullable=True)
    observed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
