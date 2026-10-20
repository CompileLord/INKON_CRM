from datetime import date, datetime
from typing import Any, Callable
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
from app.core.scoring import ScoringPolicy
from app.repositories.interfaces.student_journal_history_repository import (
    StudentJournalHistoryRecord, StudentJournalHistoryRepository, StudentJournalHistorySlice, StudentJournalSummaryRecord,
)
from app.schemas.student_journal_history import StudentJournalHistoryCursorPayload, StudentJournalHistoryPage, StudentJournalHistoryQuery
from app.schemas.user import StudentJournalPeriodResponse
from app.services.student_journal_history_cursor import StudentJournalHistoryCursorCodec


class StudentJournalHistoryService:
    legacy_limit: int = 100

    def __init__(self, repository: StudentJournalHistoryRepository, codec: StudentJournalHistoryCursorCodec,
                 clock: Callable[[], datetime] = lambda: datetime.now(ZoneInfo("Asia/Dushanbe"))) -> None:
        self._repository: StudentJournalHistoryRepository = repository
        self._codec: StudentJournalHistoryCursorCodec = codec
        self._clock: Callable[[], datetime] = clock

    async def page(self, student_id: int, query: StudentJournalHistoryQuery) -> StudentJournalHistoryPage:
        if query.course_id is not None and not await self._repository.has_enrollment(student_id, query.course_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this course")
        today: date = self._clock().astimezone(ZoneInfo("Asia/Dushanbe")).date()
        payload: StudentJournalHistoryCursorPayload | None = None
        if query.cursor is not None:
            try:
                payload = self._codec.decode(query.cursor, student_id, query.course_id, query.started_only)
            except ValueError as error:
                raise HTTPException(status_code=422, detail="Invalid history cursor") from error
        cutoff: date | None = payload.cutoff if payload is not None else today if query.started_only else None
        records: StudentJournalHistorySlice = await self._repository.page(student_id, query.course_id, cutoff,
            payload.last_period_start if payload is not None else None,
            payload.last_journal_id if payload is not None else None, query.page_size)
        cursor: str | None = None
        if records.has_more:
            last: StudentJournalHistoryRecord = records.records[-1]
            cursor = self._codec.encode(StudentJournalHistoryCursorPayload(student_id=student_id,
                course_id=query.course_id, started_only=query.started_only, cutoff=cutoff,
                last_period_start=last.period_start, last_journal_id=last.journal_id))
        return StudentJournalHistoryPage(items=[self.render(record, today) for record in records.records], next_cursor=cursor,
            has_upcoming_periods=await self._repository.has_upcoming(student_id, query.course_id, today))

    async def legacy(self, student_id: int, course_id: int | None = None) -> list[dict[str, Any]]:
        page: StudentJournalHistoryPage = await self.page(student_id, StudentJournalHistoryQuery(course_id=course_id, page_size=self.legacy_limit))
        if page.next_cursor is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Journal history exceeds the legacy limit; use /students/me/journals/page")
        return [item.model_dump() for item in page.items]

    def render(self, record: StudentJournalHistoryRecord, today: date) -> StudentJournalPeriodResponse:
        summary: StudentJournalSummaryRecord | None = record.summary
        state: str = "upcoming" if record.period_start > today else "graded" if summary is not None and summary.is_graded is True else "in_progress"
        return StudentJournalPeriodResponse(journal_id=record.journal_id, course_id=record.course_id,
            course_title=record.course_title, period_label=record.period_label,
            period_start=record.period_start, period_end=record.period_end,
            homework_score=summary.homework_score if summary is not None else 0,
            attendance_score=summary.attendance_score if summary is not None else 0,
            exam_score=summary.exam_score if summary is not None else 0,
            bonus_score=summary.bonus_score if summary is not None else 0,
            sum_score=summary.sum_score if summary is not None else 0,
            max_period_score=summary.max_period_score if summary is not None else 0,
            percentage=ScoringPolicy.percentage(summary.sum_score, summary.max_period_score) if summary is not None else 0,
            attendance_count=summary.attendance_count if summary is not None else 0,
            total_lessons=summary.total_lessons if summary is not None else 0, state=state)
