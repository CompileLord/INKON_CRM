from datetime import date
from enum import Enum
from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class JournalPeriodType(str, Enum):
    WEEK = "week"
    MONTH = "month"


class Journal(Base):
    __tablename__ = "journals"
    __table_args__ = (
        CheckConstraint("exam_max_score >= 0 AND exam_max_score <= 100", name="check_exam_max_score_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    period_label: Mapped[str] = mapped_column(String(50), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    period_type: Mapped[JournalPeriodType] = mapped_column(String(20), nullable=False)
    exam_max_score: Mapped[int] = mapped_column(Integer, default=70, server_default="70", nullable=False)

    course: Mapped["Course"] = relationship("Course")

