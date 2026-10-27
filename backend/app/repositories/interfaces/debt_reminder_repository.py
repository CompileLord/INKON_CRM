from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Protocol


@dataclass(frozen=True)
class DebtReminderSource:
    student_id: int
    student_name: str
    parent_chat_id: int | None
    parent_language: str | None
    total_debt: Decimal
    courses: tuple[tuple[str, Decimal], ...]
    parent_phone: str | None = None
    student_phone: str | None = None
    enrollment_ids: tuple[int, ...] = ()


class DebtReminderRepository(Protocol):
    async def notifications_enabled(self) -> bool: ...
    async def rollback(self) -> None: ...
    async def commit(self) -> None: ...
    async def lock_students(self, student_ids: list[int]) -> None: ...
    async def load_sources(self, student_ids: list[int], today: date) -> dict[int, DebtReminderSource]: ...
    async def last_reminder_times(self, sources: dict[int, DebtReminderSource]) -> dict[int, datetime]: ...
    async def queue(self, source: DebtReminderSource, now: datetime, channel: str, masked_destination: str) -> int: ...
    async def list_debts(self, today: date, filters: dict[str, Any], page: int, page_size: int) -> dict[str, Any]: ...
