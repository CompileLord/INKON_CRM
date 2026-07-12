from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole


class UserCreate(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: UserRole
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    parent_telegram_chat_id: Optional[int] = None
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)


class UserUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    parent_telegram_chat_id: Optional[int] = None
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    date_of_birth: Optional[date] = None
    phone: Optional[str] = None
    parent_telegram_chat_id: Optional[int] = None
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    payment_day_of_month: Optional[int] = None
    must_set_password: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


from app.schemas.course import CourseResponse


class StudentProfileResponse(BaseModel):
    user: UserResponse
    courses: list[CourseResponse]
    avg_score: float
    absences: int
    total_lessons: int


class MentorProfileResponse(BaseModel):
    user: UserResponse
    active_courses: list[CourseResponse]
    active_students_count: int
    avg_score: float

