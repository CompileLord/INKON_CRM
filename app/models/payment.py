from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class PaymentMethod(str, Enum):
    CASH = "cash"
    TRANSFER = "transfer"


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("discount_percent >= 0 AND discount_percent <= 100", name="check_discount_range"),
        Index("idx_payment_student_course", "student_id", "course_id"),
        Index("idx_payment_paid_at", "paid_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(String(20), nullable=False)
    accepted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    course: Mapped["Course"] = relationship("Course")
    accepted_by: Mapped["User"] = relationship("User", foreign_keys=[accepted_by_id])
