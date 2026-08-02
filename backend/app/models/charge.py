from datetime import date
from enum import Enum
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Date, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, SoftDeleteMixin


class ChargeType(str, Enum):
    TUITION = "tuition"
    FEE = "fee"
    LATE_FEE = "late_fee"


class ChargeStatus(str, Enum):
    OPEN = "open"
    SETTLED = "settled"
    CANCELLED = "cancelled"


class Charge(Base, SoftDeleteMixin):
    __tablename__ = "charges"
    __table_args__ = (
        CheckConstraint("amount > 0", name="check_charge_amount_positive"),
        CheckConstraint("sequence_no >= 1", name="check_charge_sequence_positive"),
        Index("idx_charges_student_due_date", "student_id", "due_date"),
        Index("idx_charges_enrollment", "enrollment_id"),
        Index("idx_charges_due_date", "due_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey("enrollments.id", ondelete="RESTRICT"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[ChargeType] = mapped_column(String(20), default=ChargeType.TUITION, server_default="tuition", nullable=False)
    status: Mapped[ChargeStatus] = mapped_column(String(20), default=ChargeStatus.OPEN, server_default="open", nullable=False)

    enrollment: Mapped["Enrollment"] = relationship("Enrollment")
    student: Mapped["User"] = relationship("User")
    allocations: Mapped[List["Allocation"]] = relationship("Allocation", back_populates="charge", cascade="all, delete-orphan")
