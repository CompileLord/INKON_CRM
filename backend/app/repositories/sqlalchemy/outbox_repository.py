from datetime import datetime, timedelta
from typing import Optional, Sequence
from sqlalchemy import cast, case, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.outbox_event import OutboxEvent, OutboxEventStatus


class SQLAlchemyOutboxRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def enqueue(self, event: OutboxEvent) -> OutboxEvent:
        self._session.add(event)
        await self._session.flush()
        return event

    async def claim_pending_batch(
        self,
        lease_owner: str,
        lease_duration_seconds: int,
        batch_size: int,
        now: datetime,
    ) -> Sequence[OutboxEvent]:
        lease_expires_at = now + timedelta(seconds=lease_duration_seconds)

        subquery = (
            select(OutboxEvent.id)
            .where(
                OutboxEvent.status == OutboxEventStatus.PENDING,
                OutboxEvent.attempt_count < OutboxEvent.max_attempts,
                (OutboxEvent.next_attempt_at.is_(None)) | (OutboxEvent.next_attempt_at <= now),
                (OutboxEvent.expires_at.is_(None)) | (OutboxEvent.expires_at > now),
                (OutboxEvent.lease_expires_at.is_(None)) | (OutboxEvent.lease_expires_at <= now),
            )
            .order_by(OutboxEvent.next_attempt_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )

        statement = (
            update(OutboxEvent)
            .where(OutboxEvent.id.in_(subquery))
            .values(
                status=OutboxEventStatus.CLAIMED,
                lease_owner=lease_owner,
                lease_expires_at=lease_expires_at,
                attempt_count=OutboxEvent.attempt_count + 1,
            )
            .returning(OutboxEvent)
        )

        result = await self._session.execute(statement)
        await self._session.flush()
        return result.scalars().all()

    async def is_lease_valid(
        self,
        event_id: int,
        lease_owner: str,
        now: datetime,
    ) -> bool:
        statement = select(OutboxEvent.id).where(
            OutboxEvent.id == event_id,
            OutboxEvent.status == OutboxEventStatus.CLAIMED,
            OutboxEvent.lease_owner == lease_owner,
            OutboxEvent.lease_expires_at > now,
        )
        result = await self._session.execute(statement)
        return result.scalar_one_or_none() is not None

    async def mark_delivered(
        self,
        event_id: int,
        lease_owner: str,
        now: datetime,
    ) -> bool:
        statement = (
            update(OutboxEvent)
            .where(
                OutboxEvent.id == event_id,
                OutboxEvent.status == OutboxEventStatus.CLAIMED,
                OutboxEvent.lease_owner == lease_owner,
                OutboxEvent.lease_expires_at > now,
            )
            .values(
                status=OutboxEventStatus.DELIVERED,
                delivered_at=now,
                lease_owner=None,
                lease_expires_at=None,
                encrypted_payload=None,
            )
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def mark_failed(
        self,
        event_id: int,
        lease_owner: str,
        error_summary: str,
        next_attempt_at: Optional[datetime],
        now: datetime,
        terminal: bool = False,
    ) -> bool:
        reached_max = (OutboxEvent.attempt_count >= OutboxEvent.max_attempts) | literal(terminal)

        terminal_status = case(
            (reached_max, cast(OutboxEventStatus.FAILED.value, OutboxEvent.status.type)),
            else_=cast(OutboxEventStatus.PENDING.value, OutboxEvent.status.type),
        )
        payload_after_fail = case(
            (reached_max, literal(None)),
            else_=OutboxEvent.encrypted_payload,
        )

        computed_next_attempt = next_attempt_at if next_attempt_at is not None else now

        statement = (
            update(OutboxEvent)
            .where(
                OutboxEvent.id == event_id,
                OutboxEvent.status == OutboxEventStatus.CLAIMED,
                OutboxEvent.lease_owner == lease_owner,
                OutboxEvent.lease_expires_at > now,
            )
            .values(
                status=terminal_status,
                lease_owner=None,
                lease_expires_at=None,
                last_error=error_summary[:500],
                next_attempt_at=computed_next_attempt,
                encrypted_payload=payload_after_fail,
            )
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def mark_expired(
        self,
        event_id: int,
        lease_owner: str,
        reason: str,
        now: datetime,
    ) -> bool:
        statement = (
            update(OutboxEvent)
            .where(
                OutboxEvent.id == event_id,
                OutboxEvent.status == OutboxEventStatus.CLAIMED,
                OutboxEvent.lease_owner == lease_owner,
                OutboxEvent.lease_expires_at > now,
            )
            .values(
                status=OutboxEventStatus.EXPIRED,
                lease_owner=None,
                lease_expires_at=None,
                last_error=reason[:500],
                encrypted_payload=None,
            )
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def expire_stale(self, now: datetime) -> int:
        statement = (
            update(OutboxEvent)
            .where(
                OutboxEvent.status.in_([OutboxEventStatus.PENDING, OutboxEventStatus.CLAIMED]),
                OutboxEvent.expires_at.is_not(None),
                OutboxEvent.expires_at <= now,
            )
            .values(
                status=OutboxEventStatus.EXPIRED,
                encrypted_payload=None,
                lease_owner=None,
                lease_expires_at=None,
            )
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return result.rowcount or 0

    async def release_stale_leases(self, now: datetime) -> int:
        reached_max = OutboxEvent.attempt_count >= OutboxEvent.max_attempts
        status_case = case(
            (reached_max, cast(OutboxEventStatus.FAILED.value, OutboxEvent.status.type)),
            else_=cast(OutboxEventStatus.PENDING.value, OutboxEvent.status.type),
        )
        payload_case = case(
            (reached_max, literal(None)),
            else_=OutboxEvent.encrypted_payload,
        )
        error_case = case(
            (reached_max, literal("Lease expired and maximum attempts reached")),
            else_=OutboxEvent.last_error,
        )
        statement = (
            update(OutboxEvent)
            .where(
                OutboxEvent.status == OutboxEventStatus.CLAIMED,
                OutboxEvent.lease_expires_at.is_not(None),
                OutboxEvent.lease_expires_at <= now,
            )
            .values(
                status=status_case,
                lease_owner=None,
                lease_expires_at=None,
                encrypted_payload=payload_case,
                last_error=error_case,
                next_attempt_at=now,
            )
        )
        result = await self._session.execute(statement)
        await self._session.flush()
        return result.rowcount or 0

    async def purge_sensitive_payload(self, event_id: int) -> None:
        statement = (
            update(OutboxEvent)
            .where(OutboxEvent.id == event_id)
            .values(encrypted_payload=None)
        )
        await self._session.execute(statement)
        await self._session.flush()
