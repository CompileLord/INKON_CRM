import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import DateTime, Enum, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class OutboxEventKind(str, enum.Enum):
    VERIFICATION_EMAIL = "verification_email"
    PASSWORD_RESET_EMAIL = "password_reset_email"
    CREDENTIALS_EMAIL = "credentials_email"
    EXAM_RESULT_NOTIFICATION = "exam_result_notification"
    DOCUMENT_NOTIFICATION = "document_notification"
    DEBT_REMINDER_SMS = "debt_reminder_sms"
    STUDENT_PASSWORD_SMS = "student_password_sms"


class OutboxEventStatus(str, enum.Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    DELIVERED = "delivered"
    FAILED = "failed"
    EXPIRED = "expired"


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        Index("ix_outbox_events_status_next_attempt_at", "status", "next_attempt_at"),
        Index("ix_outbox_events_correlation_key", "correlation_key"),
        Index("ix_outbox_events_kind_target_user_id", "kind", "target_user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[OutboxEventKind] = mapped_column(
        Enum(
            OutboxEventKind,
            name="outbox_event_kind",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    status: Mapped[OutboxEventStatus] = mapped_column(
        Enum(
            OutboxEventStatus,
            name="outbox_event_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=OutboxEventStatus.PENDING,
        server_default="pending",
    )
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    encrypted_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    correlation_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    lease_owner: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default=func.now(),
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    recipient_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    target_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_message_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dispatched_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    provider_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
