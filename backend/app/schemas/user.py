from datetime import date, datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, EmailStr, Field, model_validator
from app.models.user import UserRole
from app.schemas.common import CanonicalPhone


class UserCreate(BaseModel):
    model_config = {"extra": "forbid"}
    email: Optional[EmailStr] = None
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: UserRole
    date_of_birth: Optional[date] = None
    phone: Optional[CanonicalPhone] = None
    parent_phone: Optional[CanonicalPhone] = None
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)

    @model_validator(mode="after")
    def require_login_identifier(self) -> "UserCreate":
        if self.role == UserRole.STUDENT:
            if not (self.email or self.phone):
                raise ValueError("A student requires an email or their own phone to log in; a parent phone alone is not enough")
        elif not self.email:
            raise ValueError("An email is required for this role")
        return self


class UserUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    email: Optional[EmailStr] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[CanonicalPhone] = None
    parent_phone: Optional[CanonicalPhone] = None
    payment_day_of_month: Optional[int] = Field(None, ge=1, le=28)


class UserSelfUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    date_of_birth: Optional[date] = None
    phone: Optional[CanonicalPhone] = None


class UserResponse(BaseModel):
    id: int
    email: Optional[EmailStr] = None
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
    password_sms_destination: Optional[Literal["student_phone", "parent_phone"]] = None
    credentials_channel: Optional[Literal["email", "student_phone", "parent_phone"]] = None
    credentials_masked_phone: Optional[str] = None


class PasswordResendRequest(BaseModel):
    model_config = {"extra": "forbid"}
    channel: Optional[Literal["email", "student_phone", "parent_phone"]] = None


class PasswordSmsResendResponse(BaseModel):
    destination: Optional[Literal["student_phone", "parent_phone"]] = None
    channel: Literal["email", "student_phone", "parent_phone"]
    masked_phone: Optional[str] = None


class PasswordSmsDeliveryResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    status: Literal["pending", "claimed", "delivered", "failed", "expired"]
    masked_phone: Optional[str] = None
    attempt_count: int
    max_attempts: int
    last_error: Optional[str] = None
    provider_message_id: Optional[str] = None
    provider_status: Optional[Literal["pending", "queued", "accepted", "sent", "delivered"]] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None

    @classmethod
    def from_event(cls, event: Any) -> "PasswordSmsDeliveryResponse":
        phone: Optional[str] = event.recipient_phone
        return cls(
            id=event.id,
            user_id=event.target_user_id,
            status=event.status.value,
            masked_phone=f"***{phone[-4:]}" if phone else None,
            attempt_count=event.attempt_count,
            max_attempts=event.max_attempts,
            last_error=event.last_error,
            provider_message_id=event.provider_message_id,
            provider_status=event.provider_status,
            created_at=event.created_at,
            delivered_at=event.delivered_at,
        )


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
    total_score: int = 0
    total_max_score: int = 0


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
    total_score: int = 0
    total_max_score: int = 0


class StudentTotalsResponse(BaseModel):
    model_config = {"extra": "forbid"}
    avg_percentage: float
    total_score: int = 0
    total_max_score: int = 0
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
    my_total_score: int = 0
    my_total_max_score: int = 0
    class_avg_score: float = 0.0
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


class StudentMentorIdentityResponse(BaseModel):
    model_config = {"extra": "forbid", "from_attributes": True}
    id: int
    first_name: str
    last_name: str
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None


class StudentMentorCourseResponse(BaseModel):
    model_config = {"extra": "forbid", "from_attributes": True}
    id: int
    title: str
    photo_path: Optional[str] = None


class StudentMentorCardResponse(BaseModel):
    model_config = {"extra": "forbid"}
    user: StudentMentorIdentityResponse
    active_courses: list[StudentMentorCourseResponse]


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
