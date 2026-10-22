from dataclasses import dataclass
from datetime import date, timedelta
from collections.abc import Collection
from typing import ClassVar

from app.models.course import CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.schemas.course import CourseCreate


class CourseCopyBudgetExceeded(Exception):
    pass


class LessonDateCalculator:
    @classmethod
    def for_schedules(cls, period_start: date, period_end: date, schedules: Collection[CourseSchedule]) -> list[date]:
        return list(cls.calculate(period_start, period_end, [schedule.day_of_week for schedule in schedules]))

    @classmethod
    def held_count(cls, period_start: date, period_end: date, weekdays: Collection[int], today: date) -> int:
        return len(cls.calculate(period_start, min(period_end, today), weekdays))

    @staticmethod
    def calculate(start: date, end: date, weekdays: Collection[int]) -> tuple[date, ...]:
        selected_weekdays: set[int] = set(weekdays)
        return tuple(start + timedelta(days=offset) for offset in range((end - start).days + 1)
                     if (start + timedelta(days=offset)).weekday() in selected_weekdays)


@dataclass(frozen=True)
class CourseCopyPlan:
    maximum_enrollments: ClassVar[int] = 100
    maximum_days: ClassVar[int] = 366
    maximum_rows: ClassVar[int] = 20000
    lesson_dates: tuple[date, ...]
    estimated_rows: int

    @classmethod
    def build(cls, data: CourseCreate, enrollment_count: int) -> "CourseCopyPlan":
        duration_days: int = (data.end_date - data.start_date).days + 1
        if enrollment_count > cls.maximum_enrollments or duration_days > cls.maximum_days:
            raise CourseCopyBudgetExceeded("Synchronous course copy budget exceeded")
        lesson_dates: tuple[date, ...] = LessonDateCalculator.calculate(
            data.start_date, data.end_date, [schedule.day_of_week for schedule in data.schedules],
        )
        installment_count: int = (data.end_date.year - data.start_date.year) * 12 + data.end_date.month - data.start_date.month + 1
        journal_count: int = (duration_days + 6) // 7 if data.exam_type == CourseExamType.WEEKLY else installment_count
        estimated_rows: int = 2 + len(data.schedules) + journal_count + enrollment_count * (
            1 + len(lesson_dates) + journal_count + installment_count
        )
        if estimated_rows > cls.maximum_rows:
            raise CourseCopyBudgetExceeded("Synchronous course copy budget exceeded")
        return cls(lesson_dates=lesson_dates, estimated_rows=estimated_rows)


@dataclass(frozen=True)
class EnrollmentLessonPlan:
    course_id: int
    journals: tuple[Journal, ...]
    dates_by_journal: dict[int, tuple[date, ...]]

    @classmethod
    def build(cls, course_id: int, journals: list[Journal], lesson_dates: tuple[date, ...]) -> "EnrollmentLessonPlan":
        return cls(course_id, tuple(journals), {
            journal.id: tuple(lesson_date for lesson_date in lesson_dates
                              if journal.period_start <= lesson_date <= journal.period_end)
            for journal in journals
        })
