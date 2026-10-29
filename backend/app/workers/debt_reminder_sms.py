import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.models.outbox_event import OutboxEvent
from app.services.debt_reminder_messages import DebtReminderMessages
from app.models.user import User
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
from app.repositories.interfaces.debt_reminder_repository import DebtReminderSource
from app.workers.sms_delivery import SmsDispatchInspection, StudentPasswordSmsDispatcher


class DebtReminderSmsDispatcher(StudentPasswordSmsDispatcher):
    @staticmethod
    def idempotency_key_for(event: OutboxEvent) -> str:
        return f"debt-reminder-sms-{event.id}"

    def render_message(self, payload: dict[str, Optional[str]], inspection: SmsDispatchInspection) -> str:
        if inspection.dispatched_amount is None:
            raise ValueError("Missing current debt")
        return DebtReminderMessages().render(inspection.dispatched_amount, payload.get("language"))

    async def _inspect(
        self, event: OutboxEvent, plaintext_payload: str, session_factory: async_sessionmaker[AsyncSession],
    ) -> SmsDispatchInspection:
        try:
            payload: dict[str, str | int] = json.loads(plaintext_payload)
            if not isinstance(payload["text"], str) or not payload["text"]:
                return SmsDispatchInspection("sms_payload_corrupted", None)
        except (json.JSONDecodeError, KeyError, TypeError):
            return SmsDispatchInspection("sms_payload_corrupted", None)
        if event.target_user_id is None or not event.recipient_phone:
            return SmsDispatchInspection("sms_event_incomplete", None)
        session: AsyncSession
        async with session_factory() as session:
            user: User | None = await SQLAlchemyUserRepository(session).get_by_id(event.target_user_id)
            source: DebtReminderSource | None = await SQLAlchemyDebtReminderRepository(session).load_source(
                event.target_user_id, datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Dushanbe")).date()
            )
        if user is None or user.is_deleted:
            return SmsDispatchInspection("user_not_found_or_deleted", None)
        if source is None or source.total_debt <= 0:
            return SmsDispatchInspection("no_current_debt", None)
        if event.recipient_phone not in (user.phone, user.parent_phone):
            return SmsDispatchInspection("sms_destination_changed", None)
        return SmsDispatchInspection(None, None, source.total_debt)
