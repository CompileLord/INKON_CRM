from datetime import datetime, timedelta
from app.repositories.interfaces.exam_result_notification_repository import (
    ExamResultNotificationScheduleRepository,
)

UNSET_EXAM_SCORE: int = 0


class ExamResultSchedulingService:
    def __init__(
        self,
        repository: ExamResultNotificationScheduleRepository,
        delay_seconds: int,
    ) -> None:
        self._repository: ExamResultNotificationScheduleRepository = repository
        self._delay: timedelta = timedelta(seconds=delay_seconds)

    async def register_exam_score_edit(
        self,
        student_id: int,
        journal_id: int,
        previous_exam_score: int,
        new_exam_score: int,
        edited_at: datetime,
    ) -> None:
        if previous_exam_score == new_exam_score:
            return
        if new_exam_score == UNSET_EXAM_SCORE:
            await self._repository.cancel_pending(student_id, journal_id)
            return
        await self._repository.schedule_pending(student_id, journal_id, edited_at + self._delay)
