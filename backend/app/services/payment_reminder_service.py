from datetime import date
from typing import Any, Awaitable, Callable
from app.repositories.interfaces.payment_reminder_repository import (
    PaymentReminderDraft,
    PaymentReminderRepository,
    PaymentReminderSource,
    QueuedPaymentReminder,
    ReminderCursor,
)
from app.services.payment_reminder_messages import PaymentReminderMessages


class PaymentReminderService:
    batch_size: int = 100

    def __init__(
        self, repository: PaymentReminderRepository, enqueue: Callable[[str, dict[str, Any]], Awaitable[None]]
    ) -> None:
        self._repository: PaymentReminderRepository = repository
        self._enqueue: Callable[[str, dict[str, Any]], Awaitable[None]] = enqueue
        self._messages: PaymentReminderMessages = PaymentReminderMessages()

    async def run(self, today: date) -> int:
        cursor: ReminderCursor | None = None
        queued_count: int = 0
        while True:
            sources: list[PaymentReminderSource] = await self._repository.due_batch(today, cursor, self.batch_size)
            if not sources:
                await self._repository.commit()
                return queued_count
            drafts: list[PaymentReminderDraft] = [
                PaymentReminderDraft(source, self._messages.render(source, today)) for source in sources
            ]
            jobs: list[QueuedPaymentReminder] = await self._repository.queue_batch(today, drafts)
            await self._repository.commit()
            job: QueuedPaymentReminder
            for job in jobs:
                await self._enqueue(
                    "send_telegram_message",
                    {
                        "notification_id": job.notification_id,
                        "revision": job.revision,
                        "chat_id": job.chat_id,
                        "text": job.text,
                        "_job_id": f"notification:{job.notification_id}:{job.revision}:initial",
                    },
                )
            queued_count += len(jobs)
            last: PaymentReminderSource = sources[-1]
            cursor = ReminderCursor(last.due_date, last.enrollment_id)
            if len(sources) < self.batch_size:
                return queued_count
