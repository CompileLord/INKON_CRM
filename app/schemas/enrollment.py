from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from app.models.enrollment import EnrollmentStatus


class EnrollmentCreate(BaseModel):
    model_config = {"extra": "forbid"}
    student_id: int
    course_id: int


class EnrollmentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    price_at_enrollment: Decimal
    color_hex: str
    enrolled_at: datetime
    status: EnrollmentStatus
    is_deleted: bool
