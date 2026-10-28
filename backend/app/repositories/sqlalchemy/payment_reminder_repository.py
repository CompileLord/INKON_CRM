from datetime import date, timedelta
from typing import Any
from sqlalchemy import Date, Integer, Numeric, Row, String, Text, and_, case, cast, column, false, literal, or_, select, values
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.charge import Charge
from app.models.enrollment import Enrollment
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.repositories.interfaces.payment_reminder_repository import (
    PaymentReminderDraft,
    PaymentReminderRepository,
    PaymentReminderSource,
    QueuedPaymentReminder,
    ReminderCursor,
)
from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery


class SQLAlchemyPaymentReminderRepository(PaymentReminderRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session: AsyncSession = session
        self._query: ChargeBalanceQuery = ChargeBalanceQuery()

    async def commit(self) -> None:
        await self._session.commit()

    def source_from_row(self, row: Row[Any]) -> PaymentReminderSource:
        return PaymentReminderSource(
            row.enrollment_id,
            row.student_id,
            row.chat_id,
            f"{row.first_name} {row.last_name}".strip(),
            row.course_title,
            row.due_date,
            row.balance,
            row.language,
        )

    async def due_batch(self, today: date, cursor: ReminderCursor | None, limit: int) -> list[PaymentReminderSource]:
        statement: Any = self._query.balances().where(
            Charge.due_date.between(today + timedelta(days=1), today + timedelta(days=2)),
            self._query.payment_notifications_enabled(),
        )
        if cursor is not None:
            statement = statement.where(
                or_(
                    Charge.due_date > cursor.due_date,
                    and_(Charge.due_date == cursor.due_date, Enrollment.id > cursor.enrollment_id),
                )
            )
        result: Result[Any] = await self._session.execute(
            statement.order_by(Charge.due_date, Enrollment.id).limit(limit)
        )
        return [self.source_from_row(row) for row in result.all()]

    async def queue_batch(self, today: date, candidates: list[PaymentReminderDraft]) -> list[QueuedPaymentReminder]:
        drafts: Any = (
            values(column("enrollment_id", Integer), column("due_date", Date), column("delivery_text", Text), column("delivery_amount", Numeric(10, 2)))
            .data([(draft.source.enrollment_id, draft.source.due_date, draft.text, draft.source.balance) for draft in candidates])
            .alias("reminder_drafts")
        )
        balances: Any = self._query.balances().subquery()
        notification_type: Any = case(
            (balances.c.due_date == today + timedelta(days=1), NotificationType.PAYMENT_REMINDER_1D.value),
            else_=NotificationType.PAYMENT_REMINDER_2D.value,
        )
        selection: Any = (
            select(
                balances.c.student_id,
                cast(balances.c.chat_id, String),
                notification_type,
                balances.c.enrollment_id,
                literal(today),
                literal(NotificationStatus.FAILED.value),
                literal(0),
                literal(NotificationStatus.QUEUED.value),
                drafts.c.delivery_text,
                drafts.c.delivery_amount,
                false(),
                literal(1),
            )
            .select_from(balances)
            .join(
                drafts,
                and_(drafts.c.enrollment_id == balances.c.enrollment_id, drafts.c.due_date == balances.c.due_date),
            )
            .where(self._query.payment_notifications_enabled())
        )
        statement: Any = (
            insert(NotificationLog)
            .from_select(
                [
                    "user_id",
                    "recipient",
                    "type",
                    "related_entity_id",
                    "notification_date",
                    "status",
                    "attempts",
                    "delivery_state",
                    "delivery_text",
                    "delivery_amount",
                    "is_terminal",
                    "revision",
                ],
                selection,
            )
            .on_conflict_do_nothing(constraint="uq_notification_log")
            .returning(
                NotificationLog.id, NotificationLog.revision, NotificationLog.recipient, NotificationLog.delivery_text
            )
        )
        rows: Result[tuple[int, int, str, str]] = await self._session.execute(statement)
        return [
            QueuedPaymentReminder(notification_id, revision, int(recipient), text)
            for notification_id, revision, recipient, text in rows.all()
        ]
