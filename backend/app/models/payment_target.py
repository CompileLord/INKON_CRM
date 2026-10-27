from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PaymentTarget(Base):
    __tablename__ = 'payment_targets'
    __table_args__ = (
        CheckConstraint('amount > 0', name='check_payment_target_amount_positive'),
        UniqueConstraint('ledger_entry_id', 'enrollment_id', name='uq_payment_target_entry_enrollment'),
        Index('ix_payment_targets_enrollment_id', 'enrollment_id'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ledger_entry_id: Mapped[int] = mapped_column(ForeignKey('ledger_entries.id', ondelete='RESTRICT'), nullable=False)
    enrollment_id: Mapped[int] = mapped_column(ForeignKey('enrollments.id', ondelete='RESTRICT'), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
