from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from app.models.course import CourseExamType, CourseStatus


class CourseScheduleCreate(BaseModel):
    model_config = {"extra": "forbid"}
    day_of_week: int = Field(ge=0, le=6)
    time_start: time
    time_end: time

    @field_validator("time_end")
    @classmethod
    def validate_times(cls, time_end: time, info) -> time:
        time_start = info.data.get("time_start")
        if time_start and time_end <= time_start:
            raise ValueError("time_start must be before time_end")
        return time_end


class CourseScheduleResponse(BaseModel):
    id: int
    course_id: int
    day_of_week: int
    time_start: time
    time_end: time


class CourseCreate(BaseModel):
    model_config = {"extra": "forbid"}
    title: str = Field(min_length=1, max_length=255)
    description: str
    photo_path: Optional[str] = None
    start_date: date
    end_date: date
    exam_type: CourseExamType
    price: Decimal = Field(gt=0)
    mentor_id: int
    schedules: List[CourseScheduleCreate] = Field(min_length=1)

    @field_validator("end_date")
    @classmethod
    def validate_dates(cls, end_date: date, info) -> date:
        start_date = info.data.get("start_date")
        if start_date and end_date <= start_date:
            raise ValueError("start_date must be before end_date")
        return end_date

    @field_validator("schedules")
    @classmethod
    def validate_unique_schedules(cls, schedules: List[CourseScheduleCreate]) -> List[CourseScheduleCreate]:
        days = [item.day_of_week for item in schedules]
        if len(days) != len(set(days)):
            raise ValueError("Duplicate days of week in schedules")
        return schedules


class CourseUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    photo_path: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    mentor_id: Optional[int] = None
    status: Optional[CourseStatus] = None


class CourseResponse(BaseModel):
    id: int
    title: str
    description: str
    photo_path: Optional[str] = None
    start_date: date
    end_date: date
    exam_type: CourseExamType
    price: Decimal
    mentor_id: int
    status: CourseStatus
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class MentorMiniResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    is_deleted: bool


class CourseMentorHistoryResponse(BaseModel):
    id: int
    course_id: int
    mentor_id: int
    assigned_from: datetime
    assigned_to: Optional[datetime] = None
    mentor: MentorMiniResponse
