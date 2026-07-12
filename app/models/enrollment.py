from datetime import datetime
from decimal import Decimal
from enum import Enum
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, SoftDeleteMixin


class EnrollmentStatus(str, Enum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"
    COMPLETED = "completed"


class Enrollment(Base, SoftDeleteMixin):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_student_course"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"), nullable=False)
    price_at_enrollment: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False)
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    status: Mapped[EnrollmentStatus] = mapped_column(
        String(20),
        default=EnrollmentStatus.ACTIVE,
        server_default="active",
        nullable=False
    )

    student: Mapped["User"] = relationship("User")
    course: Mapped["Course"] = relationship("Course")
