import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ExamResultNotificationStatus(str, enum.Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    SENT = "sent"
    SKIPPED = "skipped"
    FAILED = "failed"


class ExamResultNotification(Base):
    __tablename__ = "exam_result_notifications"
    __table_args__ = (
        Index(
            "uq_exam_result_notifications_pending_student_journal",
            "student_id",
            "journal_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_exam_result_notifications_status_due_at", "status", "due_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ExamResultNotificationStatus.PENDING.value,
        server_default=ExamResultNotificationStatus.PENDING.value,
    )
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    lease_owner: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    send_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
