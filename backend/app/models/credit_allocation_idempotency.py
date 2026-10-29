from typing import Any
from sqlalchemy import ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class CreditAllocationIdempotency(Base):
    __tablename__ = "credit_allocation_idempotency"
    __table_args__ = (UniqueConstraint("recorder_id", "idempotency_key", name="uq_credit_allocation_recorder_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recorder_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
