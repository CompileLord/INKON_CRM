from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from typing_extensions import Protocol
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class NotificationClaim:
    notification_id: int
    revision: int
    claim_token: str
    attempts: int
    is_update: bool
    score: int | None
    recipient: str
    delivery_text: str | None


class NotificationLogRepository(BaseRepository[NotificationLog], Protocol):
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...
    async def user_page(self, user_id: int, page: int, page_size: int) -> tuple[list[NotificationLog], int]: ...
    async def unread_count(self, user_id: int) -> int: ...
    async def mark_all_read(self, user_id: int, now: datetime) -> int: ...
    async def delivery_page(
        self, page: int, page_size: int, delivery_status: NotificationStatus | None
    ) -> tuple[list[dict[str, Any]], int]: ...
    async def lock_or_create(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        user_id: int | None,
        score: int | None,
    ) -> NotificationLog: ...
    async def claim(
        self,
        notification_id: int,
        revision: int,
        token: str,
        now: datetime,
        lease_expires_at: datetime,
        maximum_attempts: int,
    ) -> NotificationClaim | None: ...
    async def finalize(self, claim: NotificationClaim, error: str | None, now: datetime, terminal: bool) -> bool: ...

    async def recoverable(self, now: datetime, limit: int, maximum_attempts: int) -> list[NotificationLog]: ...

    async def has_valid_reminder_source(self, notification_id: int) -> bool: ...
