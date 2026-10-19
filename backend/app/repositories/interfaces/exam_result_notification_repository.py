from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Sequence
from typing_extensions import Protocol
from app.models.exam_result_notification import ExamResultNotification


class ExamResultNotificationScheduleRepository(Protocol):
    async def schedule_pending(self, student_id: int, journal_id: int, due_at: datetime) -> None:
        ...

    async def cancel_pending(self, student_id: int, journal_id: int) -> int:
        ...


class ExamResultNotificationDeliveryRepository(Protocol):
    async def release_stale_claims(self, now: datetime) -> int:
        ...

    async def claim_due_batch(
        self,
        lease_owner: str,
        lease_duration_seconds: int,
        batch_size: int,
        now: datetime,
    ) -> Sequence[ExamResultNotification]:
        ...

    async def mark_send_started(self, notification_id: int, lease_owner: str, now: datetime) -> bool:
        ...

    async def mark_sent(self, notification_id: int, lease_owner: str, now: datetime) -> bool:
        ...

    async def mark_skipped(self, notification_id: int, lease_owner: str, reason: str, now: datetime) -> bool:
        ...

    async def mark_retry(
        self,
        notification_id: int,
        lease_owner: str,
        error_summary: str,
        next_due_at: Optional[datetime],
        now: datetime,
    ) -> bool:
        ...


@dataclass(frozen=True)
class ExamResultSource:
    student_name: str
    student_deleted: bool
    parent_chat_id: Optional[int]
    parent_language: Optional[str]
    course_title: str
    course_deleted: bool
    period_label: str
    exam_score: int
    exam_max_score: int
    sum_score: int
    max_period_score: int
    attendance_count: int
    total_lessons: int


class ExamResultSourceRepository(Protocol):
    async def load_source(self, student_id: int, journal_id: int) -> Optional[ExamResultSource]:
        ...
