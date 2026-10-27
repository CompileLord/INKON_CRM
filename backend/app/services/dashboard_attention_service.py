from datetime import date, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo
from app.core.config import settings
from app.schemas.dashboard_attention import AttentionAbsence, AttentionAbsentStudent, AttentionLesson, AttentionPayment, DashboardAttentionResponse


class AttentionRepository(Protocol):
    async def lessons(self, today: date) -> list[Any]: ...
    async def absences(self, today: date) -> list[Any]: ...
    async def payments(self, today: date) -> list[Any]: ...


class SchoolClock:
    def now(self) -> datetime:
        return datetime.now(ZoneInfo(settings.TIMEZONE))


class DashboardAttentionService:
    def __init__(self, repository: AttentionRepository, clock: SchoolClock) -> None:
        self.repository: AttentionRepository = repository
        self.clock: SchoolClock = clock

    async def get_attention(self) -> DashboardAttentionResponse:
        now: datetime = self.clock.now()
        lessons: list[Any] = await self.repository.lessons(now.date())
        absences: list[Any] = await self.repository.absences(now.date())
        payments: list[Any] = await self.repository.payments(now.date())
        in_progress: list[AttentionLesson] = []
        unmarked: list[AttentionLesson] = []
        absence_groups: list[AttentionAbsence] = []
        students_by_course: dict[int, list[AttentionAbsentStudent]] = {}
        for item in absences:
            students_by_course.setdefault(item.course_id, []).append(AttentionAbsentStudent(
                student_id=item.student_id, student_name=f'{item.first_name} {item.last_name}',
                consecutive_absences=item.streak))
        for row in lessons:
            lesson: AttentionLesson = AttentionLesson(course_id=row.id, course_title=row.title, time_start=row.time_start,
                time_end=row.time_end, mentor_name=f'{row.first_name} {row.last_name}', mentor_phone=row.phone, journal_id=row.journal_id)
            if row.time_start <= now.time().replace(tzinfo=None) < row.time_end:
                in_progress.append(lesson)
            if datetime.combine(now.date(), row.time_start, tzinfo=now.tzinfo) + timedelta(minutes=10) <= now and not row.marked:
                unmarked.append(lesson)
            students: list[AttentionAbsentStudent] = students_by_course.get(row.id, [])
            if students:
                absence_groups.append(AttentionAbsence(**lesson.model_dump(), students=students))
        return DashboardAttentionResponse(lessons_in_progress=in_progress, attendance_not_marked=unmarked,
            absent_students=absence_groups, payments=[AttentionPayment(student_id=row.id, student_name=f'{row.first_name} {row.last_name}',
            course_id=row.course_id, course_title=row.title, enrollment_id=row.enrollment_id, due_date=row.due_date,
            remaining_amount=row.remaining) for row in payments])
