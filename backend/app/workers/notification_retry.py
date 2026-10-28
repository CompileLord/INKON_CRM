import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from app.db.session import AsyncSessionLocal
from app.models.course import Course
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.models.user import User
from app.repositories.interfaces.notification_log_repository import NotificationClaim
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
from app.repositories.sqlalchemy.notification_retry_dispatch_repository import SQLAlchemyNotificationRetryDispatchRepository
from app.repositories.interfaces.payment_reminder_repository import PaymentReminderSource
from app.services.payment_reminder_messages import PaymentReminderMessages
from app.services.notification_service import NotificationService
from app.services.sms.sender import PayomchiSmsSender, ProviderPhoneFormatter
from app.telegram_bot.bot import bot


class NotificationRetryWorker:
    async def run(self, notification_id: int, revision: int) -> None:
        now: datetime = datetime.now(timezone.utc)
        token: str = secrets.token_hex(24)
        async with AsyncSessionLocal() as session:
            repository: SQLAlchemyNotificationRetryDispatchRepository = SQLAlchemyNotificationRetryDispatchRepository(session)
            log: NotificationLog | None = await repository.claim(notification_id, revision, token, now)
            if log is None:
                await session.commit()
                return
            claim: NotificationClaim = NotificationClaim(log.id, revision, token, log.attempts, False,
                                                        log.delivery_score, log.recipient, log.delivery_text)
            student: User | None = await repository.student(log.user_id)
            text: str | None
            amount: Decimal | None
            text, amount = await self._message(repository, log, student)
            if amount is not None:
                log.delivery_amount = amount
            chat_id: int | None = student.parent_telegram_chat_id if student else None
            phone: str | None = (student.parent_phone or student.phone) if student else None
            await session.commit()
            service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(session))
            if text is None or (chat_id is None and not ProviderPhoneFormatter().is_deliverable(phone)):
                await service.finalize_notification(claim, "source_or_channel_unavailable", terminal=True)
                return

            async def send(is_update: bool) -> None:
                if chat_id is not None:
                    await bot.send_message(chat_id, text)
                else:
                    sender: PayomchiSmsSender = PayomchiSmsSender()
                    try:
                        await sender.send(str(phone), text, f"notification-{notification_id}-{revision}")
                    finally:
                        await sender.aclose()

            await service.send_claim(claim, send)

    async def _message(self, repository: SQLAlchemyNotificationRetryDispatchRepository, log: NotificationLog, student: User | None) -> tuple[str | None, Decimal | None]:
        if student is None:
            return None, None
        if log.type in (NotificationType.PAYMENT_REMINDER_1D, NotificationType.PAYMENT_REMINDER_2D):
            offset: int = 1 if log.type == NotificationType.PAYMENT_REMINDER_1D else 2
            source_row: Any = await repository.reminder(log.related_entity_id, student.id, log.notification_date + timedelta(days=offset))
            if source_row is None:
                return None, None
            source: PaymentReminderSource = PaymentReminderSource(
                source_row.enrollment_id, source_row.student_id, source_row.chat_id or 0,
                f"{source_row.first_name} {source_row.last_name}".strip(), source_row.course_title,
                source_row.due_date, source_row.balance, source_row.language,
            )
            return PaymentReminderMessages().render(source, log.notification_date), source.balance
        if log.type != NotificationType.EXAM_RESULT:
            return None, None
        journal_id: int | None = log.source_journal_id or (log.related_entity_id if log.related_entity_id > 0 else None)
        result: Any = await repository.exam(journal_id, -log.related_entity_id, student.id)
        if result is None:
            return None, None
        summary: JournalStudentSummary
        journal: Journal
        course: Course
        summary, journal, course = result
        if (log.related_entity_id < 0 and summary.id != -log.related_entity_id) or (
            log.delivery_score is not None and log.delivery_score != summary.sum_score
        ):
            return None, None
        return (f"Результаты за {journal.period_label} по курсу {course.title}: Sum = "
                f"{summary.sum_score}/{summary.max_period_score}. Посещаемость: "
                f"{summary.attendance_count}/{summary.total_lessons} дней."), None


async def retry_notification_delivery(ctx: dict[str, Any], notification_id: int, revision: int) -> None:
    await NotificationRetryWorker().run(notification_id, revision)
