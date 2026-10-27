from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, List, Optional
from pydantic import BaseModel, BeforeValidator, StringConstraints
from app.models.enrollment import BillingMode, EnrollmentStatus
from app.schemas.money import PositiveMoney
from app.schemas.payment import PaymentCommentPolicy

EffectiveBillingMode = Annotated[BillingMode, BeforeValidator(lambda raw: BillingMode.PAID if raw is None else raw)]
BillingModeReason = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=PaymentCommentPolicy.MAX_LENGTH)
]


class RosterSortOrder(str, Enum):
    NAME_ASC = "name_asc"
    NAME_DESC = "name_desc"
    ENROLLED_ASC = "enrolled_asc"
    ENROLLED_DESC = "enrolled_desc"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"


class EnrollmentCreate(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    course_id: int
    price_at_enrollment: Optional[PositiveMoney] = None
    billing_mode: BillingMode = BillingMode.PAID


class EnrollmentPreviewRequest(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    course_id: int
    price_at_enrollment: Optional[PositiveMoney] = None
    billing_mode: BillingMode = BillingMode.PAID


class EnrollmentPreviewCharge(BaseModel):
    period_start: date
    due_date: date
    amount: Decimal


class EnrollmentPreviewResponse(BaseModel):
    billing_mode: BillingMode
    price_at_enrollment: Decimal
    billed_months: int
    total_amount: Decimal
    first_charge: Optional[EnrollmentPreviewCharge] = None


class BillingModeChangeRequest(BaseModel):
    model_config = {"extra": "forbid"}
    billing_mode: BillingMode
    reason: BillingModeReason


class EnrollmentResponse(BaseModel):
    model_config = {"extra": "forbid"}
    id: int
    student_id: int
    course_id: int
    price_at_enrollment: Decimal
    color_hex: str
    enrolled_at: datetime
    status: EnrollmentStatus
    is_deleted: bool
    billing_mode: EffectiveBillingMode


class BillingModeChangeResponse(BaseModel):
    enrollment: EnrollmentResponse
    cancelled_months: int
    cancelled_amount: Decimal
    written_off_amount: Decimal
    generated_months: int


class WithdrawalPreviewResponse(BaseModel):
    still_owed: Decimal
    cancelled_amount: Decimal
    months_cancelled: int


class RosterStudentIdentity(BaseModel):
    model_config = {"extra": "forbid"}
    id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None


class CourseRosterItemResponse(BaseModel):
    model_config = {"extra": "forbid"}
    id: int
    enrollment_id: int
    student_id: int
    course_id: int
    price_at_enrollment: Decimal
    color_hex: str
    enrolled_at: datetime
    status: EnrollmentStatus
    billing_mode: EffectiveBillingMode
    student: RosterStudentIdentity


class CourseRosterResponse(BaseModel):
    model_config = {"extra": "forbid"}
    items: List[CourseRosterItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    active_count: int
    located_page: Optional[int] = None
    located_index: Optional[int] = None


class RosterLocationResponse(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    enrollment_id: int
    page: int
    index: int
    total: int
    item: CourseRosterItemResponse


class EligibleCandidateResponse(BaseModel):
    model_config = {"extra": "forbid"}
    id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
