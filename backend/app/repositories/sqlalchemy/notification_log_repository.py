from datetime import date, datetime
from typing import Any, Sequence, cast as typing_cast
from sqlalchemy import Row, String, and_, case, cast, exists, false, func, or_, select, update
from sqlalchemy.engine import CursorResult, Result
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql import Select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification_log import ExamNotificationBaseline, NotificationLog, NotificationStatus, NotificationType
from app.models.user import User
from app.models.enrollment import Enrollment
from app.models.course import Course
from app.repositories.interfaces.notification_log_repository import NotificationClaim, NotificationLogRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository
from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery
from app.repositories.interfaces.payment_reminder_repository import PaymentReminderSource, ReminderDeliveryContext


class SQLAlchemyNotificationLogRepository(SQLAlchemyBaseRepository[NotificationLog], NotificationLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(NotificationLog, session)
        self._session: AsyncSession = session
        self._reminder_query: ChargeBalanceQuery = ChargeBalanceQuery()

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def user_page(self, user_id: int, page: int, page_size: int) -> tuple[list[NotificationLog], int]:
        total: int = (
            await self._session.execute(
                select(func.count()).select_from(NotificationLog).where(NotificationLog.user_id == user_id)
            )
        ).scalar_one()
        rows: list[NotificationLog] = list(
            (
                await self._session.execute(
                    select(NotificationLog)
                    .where(NotificationLog.user_id == user_id)
                    .order_by(NotificationLog.notification_date.desc(), NotificationLog.id.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            ).scalars()
        )
        return rows, total

    async def unread_count(self, user_id: int) -> int:
        return (
            await self._session.execute(
                select(func.count())
                .select_from(NotificationLog)
                .where(NotificationLog.user_id == user_id, NotificationLog.read_at.is_(None))
            )
        ).scalar_one()

    async def mark_all_read(self, user_id: int, now: datetime) -> int:
        result: CursorResult[Any] = typing_cast(
            CursorResult[Any],
            await self._session.execute(
                update(NotificationLog)
                .where(NotificationLog.user_id == user_id, NotificationLog.read_at.is_(None))
                .values(read_at=now)
            ),
        )
        return result.rowcount or 0

    async def delivery_page(
        self, page: int, page_size: int, delivery_status: NotificationStatus | None
    ) -> tuple[list[dict[str, Any]], int]:
        conditions: list[ColumnElement[bool]] = (
            [func.coalesce(NotificationLog.delivery_state, NotificationLog.status) == delivery_status.value]
            if delivery_status is not None
            else []
        )
        total: int = (
            await self._session.execute(select(func.count()).select_from(NotificationLog).where(*conditions))
        ).scalar_one()
        rows: Sequence[Row[tuple[NotificationLog, str | None, str | None]]] = (
            await self._session.execute(
                select(NotificationLog, User.first_name, User.last_name)
                .outerjoin(User, User.id == NotificationLog.user_id)
                .where(*conditions)
                .order_by(NotificationLog.notification_date.desc(), NotificationLog.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        items: list[dict[str, Any]] = [
            {
                "id": log.id,
                "recipient_name": f"{first_name} {last_name}".strip() if first_name is not None else None,
                "type": log.type,
                "notification_date": log.notification_date,
                "status": log.delivery_state or log.status,
                "attempts": log.attempts,
                "sent_at": log.sent_at,
            }
            for log, first_name, last_name in rows
        ]
        return items, total

    async def lock_or_create(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        user_id: int | None,
        score: int | None,
    ) -> NotificationLog:
        await self._session.execute(
            insert(NotificationLog)
            .values(
                recipient=recipient,
                type=notification_type,
                related_entity_id=related_entity_id,
                notification_date=notification_date,
                user_id=user_id,
                status=NotificationStatus.FAILED,
                delivery_state=NotificationStatus.QUEUED,
                attempts=0,
                delivery_score=score,
            )
            .on_conflict_do_nothing(constraint="uq_notification_log")
        )
        log: NotificationLog = (
            await self._session.execute(
                select(NotificationLog)
                .where(
                    NotificationLog.recipient == recipient,
                    NotificationLog.type == notification_type,
                    NotificationLog.related_entity_id == related_entity_id,
                    NotificationLog.notification_date == notification_date,
                )
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        return log

    async def lock_exam_identity(self, recipient: str, summary_id: int) -> str | None:
        await self._session.execute(
            insert(ExamNotificationBaseline).values(recipient=recipient, summary_id=summary_id)
            .on_conflict_do_nothing()
        )
        observed: str | None = (
            await self._session.execute(
                select(ExamNotificationBaseline.observed_fingerprint)
                .where(ExamNotificationBaseline.recipient == recipient, ExamNotificationBaseline.summary_id == summary_id)
                .with_for_update()
            )
        ).scalar_one()

        has_delivery: bool = (
            await self._session.execute(select(exists().where(
                NotificationLog.recipient == recipient,
                NotificationLog.type == NotificationType.EXAM_RESULT,
                NotificationLog.related_entity_id == -summary_id,
            )))
        ).scalar_one()
        return None if has_delivery else observed

    async def lock_exam_log(
        self, recipient: str, summary_id: int, notification_date: date, user_id: int, score: int
    ) -> NotificationLog:
        log: NotificationLog | None = (
            await self._session.execute(
                select(NotificationLog).where(
                    NotificationLog.recipient == recipient,
                    NotificationLog.type == NotificationType.EXAM_RESULT,
                    NotificationLog.related_entity_id == -summary_id,
                ).with_for_update().execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if log is not None:
            return log
        return await self.lock_or_create(
            recipient, NotificationType.EXAM_RESULT, -summary_id, notification_date, user_id, score
        )

    async def claim(
        self,
        notification_id: int,
        revision: int,
        token: str,
        now: datetime,
        lease_expires_at: datetime,
        maximum_attempts: int,
    ) -> NotificationClaim | None:
        eligible: ColumnElement[bool] = or_(
            func.coalesce(NotificationLog.delivery_state, NotificationLog.status).in_(
                [NotificationStatus.QUEUED, NotificationStatus.FAILED]
            ),
            and_(
                NotificationLog.delivery_state == NotificationStatus.INFLIGHT, NotificationLog.lease_expires_at <= now
            ),
        )
        await self._session.execute(
            update(NotificationLog).where(
                NotificationLog.id == notification_id,
                func.coalesce(NotificationLog.revision, 1) == revision,
                eligible,
                ~self._reminder_query.owned_notification_source(),
            ).values(status=NotificationStatus.FAILED, delivery_state=NotificationStatus.FAILED, is_terminal=True, error_message="source_unavailable", claim_token=None, lease_expires_at=None)
        )
        await self._session.execute(
            update(NotificationLog)
            .where(
                NotificationLog.id == notification_id,
                func.coalesce(NotificationLog.revision, 1) == revision,
                eligible,
                NotificationLog.attempts >= maximum_attempts,
            )
            .values(
                status=NotificationStatus.FAILED,
                delivery_state=NotificationStatus.FAILED,
                claim_token=None,
                lease_expires_at=None,
            )
        )
        result: Result[tuple[NotificationLog]] = await self._session.execute(
            update(NotificationLog)
            .where(
                NotificationLog.id == notification_id,
                func.coalesce(NotificationLog.revision, 1) == revision,
                eligible,
                NotificationLog.attempts < maximum_attempts,
                self._reminder_query.eligible_notification(),
                func.coalesce(NotificationLog.is_terminal, false()).is_(False),
            )
            .values(
                delivery_state=NotificationStatus.INFLIGHT,
                revision=func.coalesce(NotificationLog.revision, 1),
                claim_token=token,
                lease_expires_at=lease_expires_at,
                attempts=NotificationLog.attempts + 1,
            )
            .returning(NotificationLog)
            .execution_options(populate_existing=True)
        )
        log: NotificationLog | None = result.scalars().first()
        if log is None:
            return None
        return NotificationClaim(
            log.id,
            log.revision or 1,
            token,
            log.attempts,
            log.sent_at is not None,
            log.delivery_score,
            log.recipient,
            log.delivery_text,
        )

    async def finalize(self, claim: NotificationClaim, error: str | None, now: datetime, terminal: bool) -> bool:
        values: dict[str, Any] = {
            "status": NotificationStatus.SENT if error is None else NotificationStatus.FAILED,
            "delivery_state": NotificationStatus.SENT if error is None else NotificationStatus.FAILED,
            "is_terminal": terminal,
            "claim_token": None,
            "lease_expires_at": None,
            "error_message": (f"score:{claim.score}" if claim.score is not None else None)
            if error is None
            else error[:500],
        }
        if error is None:
            values["sent_at"] = now
        result: Result[tuple[int]] = await self._session.execute(
            update(NotificationLog)
            .where(
                NotificationLog.id == claim.notification_id,
                NotificationLog.revision == claim.revision,
                NotificationLog.delivery_state == NotificationStatus.INFLIGHT,
                NotificationLog.claim_token == claim.claim_token,
                NotificationLog.lease_expires_at > now,
            )
            .values(**values)
            .returning(NotificationLog.id)
        )
        return result.scalar_one_or_none() is not None

    async def recoverable(self, now: datetime, limit: int, maximum_attempts: int) -> list[NotificationLog]:
        expired: ColumnElement[bool] = and_(
            NotificationLog.delivery_state == NotificationStatus.INFLIGHT, NotificationLog.lease_expires_at <= now
        )
        exhausted_ids: Select[tuple[int]] = (
            select(NotificationLog.id)
            .where(
                or_(NotificationLog.delivery_state == NotificationStatus.QUEUED, expired),
                NotificationLog.attempts >= maximum_attempts,
            )
            .order_by(NotificationLog.id)
            .limit(limit)
        )
        await self._session.execute(
            update(NotificationLog)
            .where(
                NotificationLog.id.in_(exhausted_ids),
                or_(NotificationLog.delivery_state == NotificationStatus.QUEUED, expired),
                NotificationLog.attempts >= maximum_attempts,
            )
            .values(
                status=NotificationStatus.FAILED,
                delivery_state=NotificationStatus.FAILED,
                claim_token=None,
                lease_expires_at=None,
            )
        )
        eligible: ColumnElement[bool] = or_(
            NotificationLog.delivery_state.in_([NotificationStatus.QUEUED, NotificationStatus.FAILED]), expired
        )
        rows: list[NotificationLog] = list(
            (
                await self._session.execute(
                    select(NotificationLog)
                    .where(
                        eligible,
                        self._reminder_query.eligible_notification(),
                        NotificationLog.attempts < maximum_attempts,
                        func.coalesce(NotificationLog.is_terminal, false()).is_(False),
                        or_(
                            NotificationLog.delivery_text.is_not(None),
                            and_(
                                NotificationLog.type == NotificationType.EXAM_RESULT,
                                NotificationLog.user_id.is_not(None),
                            ),
                        ),
                    )
                    .order_by(NotificationLog.id)
                    .limit(limit)
                )
            ).scalars()
        )
        return rows

    async def has_valid_reminder_source(self, notification_id: int) -> bool:
        return (await self._session.execute(select(exists().where(NotificationLog.id == notification_id, self._reminder_query.eligible_notification())))).scalar_one()

    async def can_queue_reminder(self, recipient: str, notification_type: NotificationType, enrollment_id: int, notification_date: date, user_id: int | None) -> bool:
        return (await self._session.execute(select(self._reminder_query.source_for_identity(recipient, notification_type, enrollment_id, notification_date, user_id).exists()))).scalar_one()

    async def reminder_delivery_context(self, notification_id: int) -> ReminderDeliveryContext:
        balances: Any = self._reminder_query.balances().subquery()
        offset: Any = case((NotificationLog.type == NotificationType.PAYMENT_REMINDER_1D, 1), else_=2)
        statement: Any = select(NotificationLog.type.label("notification_type"), NotificationLog.notification_date, self._reminder_query.payment_notifications_enabled().label("enabled"), self._reminder_query.owned_notification_source().label("owned"), balances).select_from(NotificationLog).outerjoin(balances, and_(NotificationLog.type.in_(self._reminder_query.reminder_types), balances.c.enrollment_id == NotificationLog.related_entity_id, balances.c.student_id == NotificationLog.user_id, cast(balances.c.chat_id, String) == NotificationLog.recipient, balances.c.due_date == NotificationLog.notification_date + offset)).where(NotificationLog.id == notification_id)
        row: Row[Any] = (await self._session.execute(statement)).one()
        source: PaymentReminderSource | None = None
        if row.enrollment_id is not None:
            source = PaymentReminderSource(row.enrollment_id, row.student_id, row.chat_id, f"{row.first_name} {row.last_name}".strip(), row.course_title, row.due_date, row.balance, row.language)
        return ReminderDeliveryContext(row.notification_type in self._reminder_query.reminder_types, row.enabled, row.owned, source, row.notification_date)
