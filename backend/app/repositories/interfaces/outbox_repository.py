from datetime import datetime
from typing import Optional, Sequence
from typing_extensions import Protocol
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus


class OutboxRepository(Protocol):
    async def enqueue(self, event: OutboxEvent) -> OutboxEvent:
        ...

    async def claim_pending_batch(
        self,
        lease_owner: str,
        lease_duration_seconds: int,
        batch_size: int,
        now: datetime,
    ) -> Sequence[OutboxEvent]:
        ...

    async def begin_attempt(
        self, event_id: int, lease_owner: str, now: datetime, minimum_remaining_seconds: float,
    ) -> int | None:
        ...

    async def release_claim(self, event_id: int, lease_owner: str) -> bool:
        ...

    async def is_lease_valid(
        self,
        event_id: int,
        lease_owner: str,
        now: datetime,
    ) -> bool:
        ...

    async def mark_delivered(
        self,
        event_id: int,
        lease_owner: str,
        now: datetime,
        provider_message_id: Optional[str] = None,
        provider_status: Optional[str] = None,
    ) -> bool:
        ...

    async def mark_failed(
        self,
        event_id: int,
        lease_owner: str,
        error_summary: str,
        next_attempt_at: Optional[datetime],
        now: datetime,
        terminal: bool = False,
    ) -> bool:
        ...

    async def mark_expired(
        self,
        event_id: int,
        lease_owner: str,
        reason: str,
        now: datetime,
    ) -> bool:
        ...

    async def expire_stale(self, now: datetime) -> int:
        ...

    async def release_stale_leases(self, now: datetime) -> int:
        ...

    async def purge_sensitive_payload(self, event_id: int) -> None:
        ...

    async def list_by_kind(
        self,
        kind: OutboxEventKind,
        statuses: Sequence[OutboxEventStatus],
        limit: int,
        target_user_id: Optional[int] = None,
    ) -> Sequence[OutboxEvent]:
        ...
