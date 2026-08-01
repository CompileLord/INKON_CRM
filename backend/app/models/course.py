from datetime import date
from enum import Enum
from decimal import Decimal
from typing import Optional
from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text, Date, Index, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class CourseExamType(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class CourseStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class Course(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint("start_date < end_date", name="check_course_dates"),
        Index(
            "idx_courses_mentor_active", 
            "mentor_id", 
            postgresql_where=text("status = 'active' AND is_deleted = false")
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    exam_type: Mapped[CourseExamType] = mapped_column(String(20), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    mentor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[CourseStatus] = mapped_column(String(20), default=CourseStatus.ACTIVE, server_default="active", nullable=False)

    mentor: Mapped["User"] = relationship("User")
    schedules: Mapped[list["CourseSchedule"]] = relationship("CourseSchedule", back_populates="course", cascade="all, delete-orphan")
