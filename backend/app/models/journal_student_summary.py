from sqlalchemy import CheckConstraint, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class JournalStudentSummary(Base):
    __tablename__ = "journal_student_summaries"
    __table_args__ = (
        UniqueConstraint("journal_id", "student_id", name="uq_journal_student_summary"),
        CheckConstraint("bonus_score >= 0 AND bonus_score <= 20", name="check_bonus_score_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journals.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    homework_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    attendance_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    exam_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    bonus_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    sum_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    max_period_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    attendance_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    total_lessons: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)

    __mapper_args__ = {
        "version_id_col": version
    }

    journal: Mapped["Journal"] = relationship("Journal")
    student: Mapped["User"] = relationship("User")

    @property
    def percentage(self) -> float:
        from app.core.scoring import score_percentage
        return score_percentage(self.sum_score, self.max_period_score)


