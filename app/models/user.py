from datetime import date
from enum import Enum
from typing import Optional
from sqlalchemy import BigInteger, Integer, String, Date, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, SoftDeleteMixin, TimestampMixin


class UserRole(str, Enum):
    SUPERADMIN = "superadmin"
    MENTOR = "mentor"
    STUDENT = "student"
    ACCOUNTANT = "accountant"


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "payment_day_of_month >= 1 AND payment_day_of_month <= 28",
            name="check_payment_day_of_month_range"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(String(20), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    parent_telegram_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    photo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    must_set_password: Mapped[bool] = mapped_column(default=True, server_default="true", nullable=False)
