from datetime import datetime
from enum import Enum
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, SoftDeleteMixin


class DocumentOwnerType(str, Enum):
    STUDENT = "student"
    MENTOR = "mentor"


class Document(Base, SoftDeleteMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_type: Mapped[DocumentOwnerType] = mapped_column(String(20), nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    journal_id: Mapped[Optional[int]] = mapped_column(ForeignKey("journals.id", ondelete="SET NULL"), nullable=True)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    journal: Mapped[Optional["Journal"]] = relationship("Journal")
    uploaded_by: Mapped["User"] = relationship("User")
