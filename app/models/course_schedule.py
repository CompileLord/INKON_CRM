from datetime import time
from sqlalchemy import CheckConstraint, ForeignKey, Integer, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CourseSchedule(Base):
    __tablename__ = "course_schedules"
    __table_args__ = (
        UniqueConstraint("course_id", "day_of_week", name="uq_course_day"),
        CheckConstraint("time_start < time_end", name="check_schedule_times"),
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="check_day_of_week_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    time_start: Mapped[time] = mapped_column(Time, nullable=False)
    time_end: Mapped[time] = mapped_column(Time, nullable=False)

    course: Mapped["Course"] = relationship("Course", back_populates="schedules")
