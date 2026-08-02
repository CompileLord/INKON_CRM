from datetime import datetime
from enum import Enum
from typing import Optional
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin


class AccountingPeriodStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class AccountingPeriod(Base, TimestampMixin):
    __tablename__ = "accounting_periods"
    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_period_year_month"),
        CheckConstraint("month >= 1 AND month <= 12", name="check_valid_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[AccountingPeriodStatus] = mapped_column(
        String(20),
        default=AccountingPeriodStatus.OPEN,
        server_default="open",
        nullable=False
    )
    closed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reopen_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    closed_by: Mapped[Optional["User"]] = relationship("User")
