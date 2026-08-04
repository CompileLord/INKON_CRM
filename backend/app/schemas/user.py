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
    parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)


class UserUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    parent_telegram_chat_id: Optional[int] = None
    parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)


class UserSelfUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    parent_telegram_chat_id: Optional[int] = None
    parent_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    date_of_birth: Optional[date] = None
    phone: Optional[str] = None
    parent_telegram_chat_id: Optional[int] = None
    parent_phone: Optional[str] = None
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    payment_day_of_month: Optional[int] = None
    must_set_password: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


from app.schemas.course import CourseResponse


class StudentTotalsResponse(BaseModel):
    model_config = {"extra": "forbid"}
    avg_percentage: float
    attendance_percentage: float
    absences: int
    total_lessons: int
    active_course_count: int
    archived_course_count: int


class StudentCourseProfileResponse(BaseModel):
    model_config = {"extra": "forbid"}
    course: CourseResponse
    enrollment_status: str
    bucket: str
    my_avg_percentage: float
    attendance_percentage: float
    absences: int
    periods_total: int
    periods_graded: int
    my_rank: int
    class_size: int
    class_avg_percentage: float
    next_lesson_at: Optional[datetime] = None


class StudentProfileResponse(BaseModel):
    model_config = {"extra": "forbid"}
    user: UserResponse
    totals: StudentTotalsResponse
    courses: list[StudentCourseProfileResponse]
    avg_score: float = 0.0
    absences: int = 0
    total_lessons: int = 0


class StudentJournalPeriodResponse(BaseModel):
    model_config = {"extra": "forbid"}
    journal_id: int
    course_id: int
    course_title: str
    period_label: str
    period_start: date
    period_end: date
    homework_score: float = 0.0
    attendance_score: float = 0.0
    exam_score: float = 0.0
    bonus_score: float = 0.0
    sum_score: float
    max_period_score: float
    percentage: float
    attendance_count: int
    total_lessons: int
    state: str


class MentorProfileResponse(BaseModel):
    user: UserResponse
    active_courses: list[CourseResponse]
    active_students_count: int
    avg_score: float


