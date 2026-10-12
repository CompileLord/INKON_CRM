from dataclasses import dataclass
from datetime import date, time
from typing import Optional, Protocol
from app.models.course import CourseStatus


class ScheduleRuleProtocol(Protocol):
    day_of_week: int
    time_start: time


class CourseScheduleTargetProtocol(Protocol):
    start_date: date
    end_date: date
    status: CourseStatus
    is_deleted: bool


@dataclass(frozen=True)
class CourseScheduleRuleDTO:
    day_of_week: int
    time_start: time
    time_end: Optional[time] = None
