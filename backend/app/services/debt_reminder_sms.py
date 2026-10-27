import json
from datetime import datetime, timedelta
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.repositories.interfaces.outbox_repository import OutboxRepository
from app.services.message_language import MessageLanguage
from app.services.outbox_service import OutboxPayloadEncryptor
from app.services.debt_reminder_messages import DebtReminderMessages
from app.repositories.interfaces.debt_reminder_repository import DebtReminderSource


class DebtReminderSms:
    def __init__(self, repository: OutboxRepository, encryptor: OutboxPayloadEncryptor) -> None:
        self._repository: OutboxRepository = repository
        self._encryptor: OutboxPayloadEncryptor = encryptor

    async def queue(self, source: DebtReminderSource, destination: str, notification_id: int, now: datetime) -> None:
        payload: dict[str, str | int] = {
            "text": DebtReminderMessages().render(source.total_debt, source.parent_language),
            "language": MessageLanguage.resolve(source.parent_language), "notification_id": notification_id,
        }
        await self._repository.enqueue(OutboxEvent(
            kind=OutboxEventKind.DEBT_REMINDER_SMS, status=OutboxEventStatus.PENDING,
            recipient_email="", subject="", recipient_phone=destination, target_user_id=source.student_id,
            encrypted_payload=self._encryptor.encrypt(json.dumps(payload)),
            correlation_key=f"debt-reminder:{notification_id}", max_attempts=6, next_attempt_at=now,
            expires_at=now + timedelta(hours=24),
        ))
