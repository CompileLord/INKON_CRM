from datetime import datetime, timedelta
from typing import Any, Sequence
from sqlalchemy import and_, case, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.debt_reminder_notification import DebtReminderNotification as Notification


class SQLAlchemyDebtReminderDeliveryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def release_stale_claims(self, now: datetime) -> None:
        uncertain: Any = or_(Notification.send_started_at.is_not(None), Notification.attempt_count >= Notification.max_attempts)
        await self._session.execute(
            update(Notification).where(Notification.status == "claimed", Notification.lease_expires_at <= now)
            .values(
                status=case((uncertain, "failed"), else_="pending"), lease_owner=None, lease_expires_at=None,
                last_error=case((Notification.send_started_at.is_not(None), "delivery_outcome_unknown"),
                                (Notification.attempt_count >= Notification.max_attempts, "maximum_attempts_reached"),
                                else_="lease_expired"),
            )
        )

    async def claim_due_batch(self, owner: str, now: datetime, batch_size: int = 20) -> Sequence[Notification]:
        due: Any = (
            select(Notification.id).where(Notification.status == "pending", Notification.due_at <= now,
                                          Notification.attempt_count < Notification.max_attempts)
            .order_by(Notification.due_at, Notification.id).limit(batch_size)
            .with_for_update(skip_locked=True).scalar_subquery()
        )
        result: Any = await self._session.execute(
            update(Notification).where(Notification.id.in_(due))
            .values(status="claimed", lease_owner=owner, lease_expires_at=now + timedelta(seconds=180),
                    send_started_at=None, attempt_count=Notification.attempt_count + 1).returning(Notification)
        )
        return result.scalars().all()

    async def mark_send_started(self, notification_id: int, owner: str, now: datetime) -> bool:
        result: Any = await self._session.execute(
            update(Notification).where(Notification.id == notification_id, Notification.status == "claimed",
                                       Notification.lease_owner == owner, Notification.lease_expires_at > now,
                                       Notification.send_started_at.is_(None))
            .values(send_started_at=now)
        )
        return bool(result.rowcount)

    async def settle(
        self, notification_id: int, owner: str, status: str, now: datetime,
        reason: str | None = None, next_due_at: datetime | None = None,
    ) -> None:
        values: dict[str, Any] = {"status": status, "last_error": reason, "lease_owner": None, "lease_expires_at": None}
        if status == "sent":
            values["sent_at"] = now
        if next_due_at is not None:
            values.update(due_at=next_due_at, send_started_at=None)
        await self._session.execute(
            update(Notification).where(Notification.id == notification_id, Notification.status == "claimed",
                                       Notification.lease_owner == owner).values(**values)
        )
