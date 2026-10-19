from datetime import date, datetime
from typing import Literal, Optional
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


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    first_name: str
    last_name: str
    role: UserRole
    date_of_birth: Optional[date] = None
    phone: Optional[str] = None
    parent_telegram_chat_id: Optional[int] = None
    parent_linked: bool = False
    parent_link_code_expires_at: Optional[datetime] = None
    parent_phone: Optional[str] = None
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    payment_day_of_month: Optional[int] = None
    must_set_password: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime



class UserCreateResponse(UserResponse):
    parent_link_code: Optional[str] = None


from app.schemas.course import CourseResponse, StaffGradingProvenance, StaffGradingState


class StudentPerformanceTotalsResponse(BaseModel):
    model_config = {"extra": "forbid"}
    scope: Literal["all_recorded_student_period_summaries"] = "all_recorded_student_period_summaries"
    measured_population: Literal["all_recorded_student_period_summaries"] = "all_recorded_student_period_summaries"
    denominator_basis: Literal["stored_period_total_lessons"] = "stored_period_total_lessons"
    grading_state: StaffGradingState
    grading_provenance: StaffGradingProvenance = "unknown"
    raw_avg_percentage: Optional[float] = None
    attendance_percentage: Optional[float] = None
    attendance_denominator: int = 0
    attended_lessons: int = 0
    absences: int = 0
    total_lessons: int = 0
    period_summaries_count: int = 0
    periods_with_max_score_count: int = 0


class StudentCoursePerformanceResponse(BaseModel):
    model_config = {"extra": "forbid"}
    scope: Literal["single_course"] = "single_course"
    measured_population: Literal["single_course_recorded_period_summaries"] = "single_course_recorded_period_summaries"
    denominator_basis: Literal["stored_period_total_lessons"] = "stored_period_total_lessons"
    grading_state: StaffGradingState
    grading_provenance: StaffGradingProvenance = "unknown"
    raw_avg_percentage: Optional[float] = None
    attendance_percentage: Optional[float] = None
    attendance_denominator: int = 0
    attended_lessons: int = 0
    absences: int = 0
    total_lessons: int = 0
    period_summaries_count: int = 0
    periods_with_max_score_count: int = 0


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
    performance: Optional[StudentCoursePerformanceResponse] = None


class StudentProfileResponse(BaseModel):
    model_config = {"extra": "forbid"}
    user: UserResponse
    totals: StudentTotalsResponse
    courses: list[StudentCourseProfileResponse]
    avg_score: float = 0.0
    absences: int = 0
    total_lessons: int = 0
    performance: Optional[StudentPerformanceTotalsResponse] = None


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
    model_config = {"extra": "forbid"}
    user: UserResponse
    active_courses: list[CourseResponse]
    active_students_count: int
    avg_score: float
    active_students_population: Literal["active_enrollments_on_assigned_courses_including_soft_deleted_courses"]
    avg_score_grading_state: Literal["missing", "unknown"]
    avg_score_provenance: Literal["unknown"]
    avg_score_basis: Literal["all_summaries_on_courses_currently_assigned_including_soft_deleted_and_archived"]
    avg_score_summary_count: int
    avg_score_defined_ratio_count: int
    avg_score_undefined_ratio_count: int
    avg_score_defined_ratios_mean: Optional[float]


class MentorAnalyticsResponse(BaseModel):
    model_config = {"extra": "forbid"}
    active_courses_count: int
    active_courses_population: Literal["active_non_deleted_courses"]
    total_students_count: int
    total_students_population: Literal["non_deleted_enrollments_on_assigned_courses_all_statuses_including_soft_deleted_courses"]
    average_student_score: float
    average_student_score_grading_state: Literal["missing", "unknown"]
    average_student_score_provenance: Literal["unknown"]
    average_student_score_basis: Literal["all_summaries_on_non_deleted_courses_including_archived_raw_points"]
    average_student_score_summary_count: int




class TelegramLinkCodeResponse(BaseModel):
    code: str
    expires_at: datetime
