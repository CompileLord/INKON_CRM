from datetime import datetime, timedelta
from typing import Optional, Sequence
from sqlalchemy import and_, case, exists, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from app.models.exam_result_notification import ExamResultNotification, ExamResultNotificationStatus


class SQLAlchemyExamResultNotificationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session

    async def schedule_pending(self, student_id: int, journal_id: int, due_at: datetime) -> None:
        statement = postgresql_insert(ExamResultNotification).values(
            student_id=student_id,
            journal_id=journal_id,
            status=ExamResultNotificationStatus.PENDING.value,
            due_at=due_at,
        )
        upsert = statement.on_conflict_do_update(
            index_elements=[ExamResultNotification.student_id, ExamResultNotification.journal_id],
            index_where=text(f"status = '{ExamResultNotificationStatus.PENDING.value}'"),
            set_={
                "due_at": due_at,
                "attempt_count": 0,
                "last_error": None,
                "updated_at": func.now(),
            },
        )
        await self._session.execute(upsert)
        await self._session.flush()

    async def cancel_pending(self, student_id: int, journal_id: int) -> int:
        result = await self._session.execute(
            update(ExamResultNotification)
            .where(
                ExamResultNotification.student_id == student_id,
                ExamResultNotification.journal_id == journal_id,
                ExamResultNotification.status == ExamResultNotificationStatus.PENDING.value,
            )
            .values(
                status=ExamResultNotificationStatus.SKIPPED.value,
                last_error="exam_score_cleared",
            )
        )
        await self._session.flush()
        return result.rowcount or 0

    async def release_stale_claims(self, now: datetime) -> int:
        stale_condition = and_(
            ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value,
            ExamResultNotification.lease_expires_at.is_not(None),
            ExamResultNotification.lease_expires_at <= now,
        )
        unknown_outcome = await self._session.execute(
            update(ExamResultNotification)
            .where(
                stale_condition,
                or_(
                    ExamResultNotification.send_started_at.is_not(None),
                    ExamResultNotification.attempt_count >= ExamResultNotification.max_attempts,
                ),
            )
            .values(
                status=ExamResultNotificationStatus.FAILED.value,
                lease_owner=None,
                lease_expires_at=None,
                last_error=case(
                    (ExamResultNotification.send_started_at.is_not(None), "delivery_outcome_unknown"),
                    else_="maximum_attempts_reached",
                ),
            )
        )
        stale_ids = (
            select(ExamResultNotification.id)
            .where(stale_condition, ExamResultNotification.send_started_at.is_(None))
            .scalar_subquery()
        )
        released: int = await self._return_to_pending(ExamResultNotification.id.in_(stale_ids), now, "lease_expired")
        await self._session.flush()
        return (unknown_outcome.rowcount or 0) + released

    async def claim_due_batch(
        self,
        lease_owner: str,
        lease_duration_seconds: int,
        batch_size: int,
        now: datetime,
    ) -> Sequence[ExamResultNotification]:
        due_ids = (
            select(ExamResultNotification.id)
            .where(
                ExamResultNotification.status == ExamResultNotificationStatus.PENDING.value,
                ExamResultNotification.due_at <= now,
                ExamResultNotification.attempt_count < ExamResultNotification.max_attempts,
            )
            .order_by(ExamResultNotification.due_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        result = await self._session.execute(
            update(ExamResultNotification)
            .where(ExamResultNotification.id.in_(due_ids))
            .values(
                status=ExamResultNotificationStatus.CLAIMED.value,
                lease_owner=lease_owner,
                lease_expires_at=now + timedelta(seconds=lease_duration_seconds),
                send_started_at=None,
                attempt_count=ExamResultNotification.attempt_count + 1,
            )
            .returning(ExamResultNotification)
        )
        await self._session.flush()
        return result.scalars().all()

    async def mark_send_started(self, notification_id: int, lease_owner: str, now: datetime) -> bool:
        result = await self._session.execute(
            update(ExamResultNotification)
            .where(*self._lease_conditions(notification_id, lease_owner, now))
            .values(send_started_at=now)
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def mark_sent(self, notification_id: int, lease_owner: str, now: datetime) -> bool:
        result = await self._session.execute(
            update(ExamResultNotification)
            .where(
                ExamResultNotification.id == notification_id,
                ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value,
                ExamResultNotification.lease_owner == lease_owner,
            )
            .values(
                status=ExamResultNotificationStatus.SENT.value,
                sent_at=now,
                lease_owner=None,
                lease_expires_at=None,
                last_error=None,
            )
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def mark_skipped(self, notification_id: int, lease_owner: str, reason: str, now: datetime) -> bool:
        result = await self._session.execute(
            update(ExamResultNotification)
            .where(
                ExamResultNotification.id == notification_id,
                ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value,
                ExamResultNotification.lease_owner == lease_owner,
            )
            .values(
                status=ExamResultNotificationStatus.SKIPPED.value,
                lease_owner=None,
                lease_expires_at=None,
                last_error=reason[:500],
            )
        )
        await self._session.flush()
        return (result.rowcount or 0) > 0

    async def mark_retry(
        self,
        notification_id: int,
        lease_owner: str,
        error_summary: str,
        next_due_at: Optional[datetime],
        now: datetime,
    ) -> bool:
        if next_due_at is None:
            result = await self._session.execute(
                update(ExamResultNotification)
                .where(
                    ExamResultNotification.id == notification_id,
                    ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value,
                    ExamResultNotification.lease_owner == lease_owner,
                )
                .values(
                    status=ExamResultNotificationStatus.FAILED.value,
                    lease_owner=None,
                    lease_expires_at=None,
                    last_error=error_summary[:500],
                )
            )
            await self._session.flush()
            return (result.rowcount or 0) > 0
        returned: int = await self._return_to_pending(
            and_(
                ExamResultNotification.id == notification_id,
                ExamResultNotification.lease_owner == lease_owner,
            ),
            next_due_at,
            error_summary,
        )
        await self._session.flush()
        return returned > 0

    def _lease_conditions(self, notification_id: int, lease_owner: str, now: datetime) -> tuple:
        return (
            ExamResultNotification.id == notification_id,
            ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value,
            ExamResultNotification.lease_owner == lease_owner,
            ExamResultNotification.lease_expires_at > now,
        )

    async def _return_to_pending(self, selection, next_due_at: datetime, reason: str) -> int:
        newer = aliased(ExamResultNotification)
        has_newer_pending = exists().where(
            newer.student_id == ExamResultNotification.student_id,
            newer.journal_id == ExamResultNotification.journal_id,
            newer.status == ExamResultNotificationStatus.PENDING.value,
        )
        claimed = ExamResultNotification.status == ExamResultNotificationStatus.CLAIMED.value
        superseded = await self._session.execute(
            update(ExamResultNotification)
            .where(selection, claimed, has_newer_pending)
            .values(
                status=ExamResultNotificationStatus.SKIPPED.value,
                lease_owner=None,
                lease_expires_at=None,
                last_error="superseded_by_newer_edit",
            )
        )
        returned = await self._session.execute(
            update(ExamResultNotification)
            .where(selection, claimed)
            .values(
                status=ExamResultNotificationStatus.PENDING.value,
                due_at=next_due_at,
                lease_owner=None,
                lease_expires_at=None,
                send_started_at=None,
                last_error=reason[:500],
            )
        )
        return (superseded.rowcount or 0) + (returned.rowcount or 0)
