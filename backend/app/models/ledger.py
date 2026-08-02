from datetime import datetime
from enum import Enum
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.payment import PaymentMethod


class LedgerEntryType(str, Enum):
    PAYMENT = "payment"
    DISCOUNT = "discount"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"
    VOID = "void"


class LedgerEntry(Base):
    """Immutable financial event. Rows are never updated or deleted — a
    correction is a ``void`` entry plus a replacement, and both stay visible.
    """

    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="check_ledger_amount_positive"),
        Index("idx_ledger_student_occurred", "student_id", "occurred_at"),
        Index("idx_ledger_type_occurred", "type", "occurred_at"),
        Index("idx_ledger_reverses", "reverses_entry_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    type: Mapped[LedgerEntryType] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    method: Mapped[Optional[PaymentMethod]] = mapped_column(String(20), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reverses_entry_id: Mapped[Optional[int]] = mapped_column(ForeignKey("ledger_entries.id", ondelete="RESTRICT"), nullable=True)
    # True  -> cash physically left the centre (reduces the student's credit)
    # False -> value returned to the student's wallet (credit is retained)
    # NULL  -> not a refund
    is_cash_out: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    reason_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    recorded_by: Mapped["User"] = relationship("User", foreign_keys=[recorded_by_id])
    reverses_entry: Mapped[Optional["LedgerEntry"]] = relationship("LedgerEntry", remote_side=[id], foreign_keys=[reverses_entry_id])
    allocations: Mapped[List["Allocation"]] = relationship(
        "Allocation",
        back_populates="ledger_entry",
        foreign_keys="Allocation.ledger_entry_id",
    )
