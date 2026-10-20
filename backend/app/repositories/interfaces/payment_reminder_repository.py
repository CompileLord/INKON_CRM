from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class ReminderCursor:
    due_date: date
    enrollment_id: int


@dataclass(frozen=True)
class PaymentReminderSource:
    enrollment_id: int
    student_id: int
    chat_id: int
    student_name: str
    course_title: str
    due_date: date
    balance: Decimal
    language: str | None


@dataclass(frozen=True)
class QueuedPaymentReminder:
    notification_id: int
    revision: int
    chat_id: int
    text: str


@dataclass(frozen=True)
class PaymentReminderDraft:
    source: PaymentReminderSource
    text: str


@dataclass(frozen=True)
class ReminderDeliveryContext:
    is_reminder: bool
    enabled: bool
    owned: bool
    source: PaymentReminderSource | None
    notification_date: date


class PaymentReminderRepository(Protocol):
    async def due_batch(
        self, today: date, cursor: ReminderCursor | None, limit: int
    ) -> list[PaymentReminderSource]: ...
    async def queue_batch(self, today: date, candidates: list[PaymentReminderDraft]) -> list[QueuedPaymentReminder]: ...
    async def commit(self) -> None: ...
