from datetime import date
from typing import Optional
from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, Text, UniqueConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("journal_id", "student_id", "lesson_date", name="uq_journal_student_date"),
        CheckConstraint("score >= 0 AND score <= 5", name="check_score_range"),
        Index(
            "idx_journal_entries_student_attendance", 
            "student_id", 
            postgresql_where=text("attendance = false")
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    lesson_date: Mapped[date] = mapped_column(Date, nullable=False)
    attendance: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)

    __mapper_args__ = {
        "version_id_col": version
    }

    journal: Mapped["Journal"] = relationship("Journal")
    student: Mapped["User"] = relationship("User")
