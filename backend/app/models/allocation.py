from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Allocation(Base):
    """Links a credit ledger entry to the charge it settles.

    Allocations are never deleted or re-priced. Reversing one stamps
    ``reversed_by_entry_id`` with the void/refund entry that undid it, so the
    history of what settled what — and what later undid it — stays intact.
    Only rows with ``reversed_by_entry_id IS NULL`` count toward balances.
    """

    __tablename__ = "allocations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="check_allocation_amount_positive"),
        Index("idx_allocations_charge", "charge_id"),
        Index("idx_allocations_ledger_entry", "ledger_entry_id"),
        Index("idx_allocations_active", "charge_id", "reversed_by_entry_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ledger_entry_id: Mapped[int] = mapped_column(ForeignKey("ledger_entries.id", ondelete="RESTRICT"), nullable=False)
    charge_id: Mapped[int] = mapped_column(ForeignKey("charges.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reversed_by_entry_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("ledger_entries.id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    ledger_entry: Mapped["LedgerEntry"] = relationship(
        "LedgerEntry",
        back_populates="allocations",
        foreign_keys=[ledger_entry_id],
    )
    reversed_by: Mapped[Optional["LedgerEntry"]] = relationship(
        "LedgerEntry",
        foreign_keys=[reversed_by_entry_id],
    )
    charge: Mapped["Charge"] = relationship("Charge", back_populates="allocations")
