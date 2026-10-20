import asyncio
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable
from arq import Retry
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from fastapi import HTTPException, status
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.repositories.interfaces.notification_log_repository import NotificationClaim, NotificationLogRepository
from app.repositories.interfaces.payment_reminder_repository import ReminderDeliveryContext
from app.services.payment_reminder_messages import PaymentReminderMessages


class ExamNotificationFingerprint:
    @classmethod
    def build(cls, values: tuple[str | int, ...]) -> str:
        encoded: str = "".join(f"{len(str(value).encode('utf-8'))}:{value}" for value in values)
        return "v1:" + hashlib.md5(encoded.encode("utf-8"), usedforsecurity=False).hexdigest()


class NotificationService:
    maximum_attempts: int = 3
    lease_seconds: int = 90
    send_timeout_seconds: int = 30

    def __init__(self, repository: NotificationLogRepository) -> None:
        self.repo: NotificationLogRepository = repository

    async def get_user_notifications(self, user_id: int, page: int = 1, page_size: int = 20) -> dict[str, Any]:
        items: list[NotificationLog]
        total: int
        items, total = await self.repo.user_page(user_id, page, page_size)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        }

    async def get_unread_count(self, user_id: int) -> int:
        return await self.repo.unread_count(user_id)

    async def mark_as_read(self, notification_id: int, user_id: int) -> NotificationLog:
        log: NotificationLog | None = await self.repo.get_by_id(notification_id)
        if log is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        if log.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if log.read_at is None:
            log.read_at = datetime.now(timezone.utc)
            await self.repo.commit()
        return log

    async def mark_all_as_read(self, user_id: int) -> int:
        count: int = await self.repo.mark_all_read(user_id, datetime.now(timezone.utc))
        await self.repo.commit()
        return count

    async def get_delivery_log(
        self, page: int, page_size: int, delivery_status: NotificationStatus | None
    ) -> dict[str, Any]:
        items: list[dict[str, Any]]
        total: int
        items, total = await self.repo.delivery_page(page, page_size, delivery_status)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        }

    async def reserve_notification(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        user_id: int | None,
        score: int | None,
        revision_requested: bool,
        delivery_text: str | None = None,
        revision_fingerprint: str | None = None,
        summary_id: int | None = None,
        source_journal_id: int | None = None,
    ) -> NotificationLog | None:
        if notification_type in (NotificationType.PAYMENT_REMINDER_1D, NotificationType.PAYMENT_REMINDER_2D):
            allowed: bool = await self.repo.can_queue_reminder(recipient, notification_type, related_entity_id, notification_date, user_id)
            if not allowed:
                return None
        log: NotificationLog
        if summary_id is not None:
            if user_id is None or score is None or revision_fingerprint is None:
                raise ValueError("Exam revision identity requires student, score and fingerprint")
            observed: str | None = await self.repo.lock_exam_identity(recipient, summary_id)
            if observed == revision_fingerprint:
                return None
            log = await self.repo.lock_exam_log(recipient, summary_id, notification_date, user_id, score)
        else:
            log = await self.repo.lock_or_create(
                recipient, notification_type, related_entity_id, notification_date, user_id, score
            )
        log.revision = log.revision or 1
        now: datetime = datetime.now(timezone.utc)
        if (
            (log.delivery_state or log.status) == NotificationStatus.INFLIGHT
            and log.lease_expires_at is not None
            and log.lease_expires_at > now
            and (revision_fingerprint is None or log.revision_fingerprint == revision_fingerprint)
        ):
            return None
        changed_score: bool = (
            log.revision_fingerprint is not None and log.revision_fingerprint != revision_fingerprint
            if revision_fingerprint is not None
            else score is not None and log.delivery_score != score
        )
        legacy_same_score: bool = log.delivery_score is None and log.error_message == f"score:{score}"
        if (log.delivery_state or log.status) == NotificationStatus.SENT:
            if revision_fingerprint is not None:
                if not changed_score:
                    return None
            elif not revision_requested or (score is not None and (not changed_score or legacy_same_score)):
                return None
        if changed_score or ((log.delivery_state or log.status) == NotificationStatus.SENT and revision_requested):
            log.revision += 1
            log.delivery_score = score
            log.attempts = 0
        if log.attempts >= self.maximum_attempts:
            log.status = NotificationStatus.FAILED
            log.delivery_state = NotificationStatus.FAILED
            log.claim_token = None
            log.lease_expires_at = None
            return None
        if log.is_terminal and not changed_score:
            return None
        if user_id is not None and log.user_id is None:
            log.user_id = user_id
        log.delivery_state = NotificationStatus.QUEUED
        log.status = NotificationStatus.FAILED
        log.claim_token = None
        log.lease_expires_at = None
        log.is_terminal = False
        log.delivery_text = delivery_text
        if revision_fingerprint is not None:
            log.revision_fingerprint = revision_fingerprint
            log.source_journal_id = source_journal_id
        await self.repo.update(log)
        return log

    async def queue_notification(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        enqueue_func: Callable[[int, int], Awaitable[None]],
        score_val: int | None = None,
        user_id: int | None = None,
        revision_requested: bool = False,
        delivery_text: str | None = None,
    ) -> bool:
        log: NotificationLog | None = await self.reserve_notification(
            recipient,
            notification_type,
            related_entity_id,
            notification_date,
            user_id,
            score_val,
            revision_requested,
            delivery_text,
        )
        notification_id: int | None = log.id if log is not None else None
        revision: int | None = log.revision if log is not None else None
        await self.repo.commit()
        if notification_id is None or revision is None:
            return False
        await enqueue_func(notification_id, revision)
        return True

    async def claim_notification(self, notification_id: int, revision: int) -> NotificationClaim | None:
        now: datetime = datetime.now(timezone.utc)
        claim: NotificationClaim | None = await self.repo.claim(
            notification_id,
            revision,
            secrets.token_hex(24),
            now,
            now + timedelta(seconds=self.lease_seconds),
            self.maximum_attempts,
        )
        await self.repo.commit()
        return claim

    async def finalize_notification(self, claim: NotificationClaim, error: str | None, terminal: bool = False) -> bool:
        finalized: bool = await self.repo.finalize(claim, error, datetime.now(timezone.utc), terminal)
        await self.repo.commit()
        return finalized

    async def deliver_notification(
        self, notification_id: int, revision: int, send_func: Callable[[bool], Awaitable[None]]
    ) -> bool:
        claim: NotificationClaim | None = await self.claim_notification(notification_id, revision)
        if claim is None:
            return False
        return await self.send_claim(claim, send_func)

    async def deliver_queued_notification(
        self, notification_id: int, revision: int, sender: Callable[[int, str], Awaitable[Any]]
    ) -> bool:
        claim: NotificationClaim | None = await self.claim_notification(notification_id, revision)
        if claim is None:
            return False

        context: ReminderDeliveryContext = await self.repo.reminder_delivery_context(notification_id)
        await self.repo.commit()
        text: str | None = claim.delivery_text
        if context.is_reminder:
            if not context.enabled:
                await self.finalize_notification(claim, "notification_disabled")
                return False
            if context.source is None:
                await self.finalize_notification(claim, "source_unavailable" if not context.owned else "balance_settled", terminal=not context.owned)
                return False
            text = PaymentReminderMessages().render(context.source, context.notification_date)

        async def send(is_update: bool) -> None:
            if text is None:
                raise ValueError("Queued notification has no delivery text")
            await sender(int(claim.recipient), text)

        return await self.send_claim(claim, send)

    async def send_claim(self, claim: NotificationClaim, send_func: Callable[[bool], Awaitable[None]]) -> bool:
        try:
            async with asyncio.timeout(self.send_timeout_seconds):
                await send_func(claim.is_update)
        except Exception as error:
            terminal: bool = isinstance(error, (TelegramForbiddenError, TelegramBadRequest))
            finalized: bool = await self.finalize_notification(claim, type(error).__name__, terminal)
            if (
                finalized
                and claim.attempts < self.maximum_attempts
                and not isinstance(error, (TelegramForbiddenError, TelegramBadRequest))
            ):
                raise Retry(defer=5 * claim.attempts) from error
            return False
        return await self.finalize_notification(claim, None)

    async def send_notification_with_idempotency(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        send_func: Callable[[bool], Awaitable[None]],
        check_revision_func: Callable[[], Awaitable[bool]] | None = None,
        score_val: int | None = None,
        user_id: int | None = None,
    ) -> bool:
        revision_requested: bool = await check_revision_func() if check_revision_func is not None else False
        log: NotificationLog | None = await self.reserve_notification(
            recipient, notification_type, related_entity_id, notification_date, user_id, score_val, revision_requested
        )
        notification_id: int | None = log.id if log is not None else None
        revision: int | None = log.revision if log is not None else None
        await self.repo.commit()
        if notification_id is None or revision is None:
            return False
        return await self.deliver_notification(notification_id, revision, send_func)

    async def send_exam_revision(
        self, recipient: str, summary_id: int, journal_id: int, student_id: int,
        score: int, fingerprint: str, notification_date: date,
        send_func: Callable[[bool], Awaitable[None]],
    ) -> bool:
        log: NotificationLog | None = await self.reserve_notification(
            recipient, NotificationType.EXAM_RESULT, -summary_id, notification_date, student_id, score, True,
            revision_fingerprint=fingerprint, summary_id=summary_id, source_journal_id=journal_id,
        )
        notification_id: int | None = log.id if log is not None else None
        revision: int | None = log.revision if log is not None else None
        await self.repo.commit()
        if notification_id is None or revision is None:
            return False
        return await self.deliver_notification(notification_id, revision, send_func)

    async def reject_notification(self, notification_id: int, revision: int, reason: str) -> bool:
        claim: NotificationClaim | None = await self.claim_notification(notification_id, revision)
        if claim is None:
            return False
        return await self.finalize_notification(claim, reason, terminal=True)

    async def recover_deliveries(
        self, enqueue_func: Callable[[str, dict[str, Any]], Awaitable[None]], limit: int = 100
    ) -> int:
        rows: list[NotificationLog] = await self.repo.recoverable(
            datetime.now(timezone.utc), limit, self.maximum_attempts
        )
        jobs: list[tuple[str, dict[str, Any]]] = []
        log: NotificationLog
        for log in rows:
            payload: dict[str, Any] = {
                "notification_id": log.id,
                "revision": log.revision or 1,
                "_job_id": f"notification:{log.id}:{log.revision}:recovery:{log.attempts}",
            }
            if log.delivery_text is not None:
                payload.update(chat_id=int(log.recipient), text=log.delivery_text)
                jobs.append(("send_telegram_message", payload))
            else:
                payload.update(student_id=log.user_id, journal_id=log.source_journal_id if log.source_journal_id is not None else log.related_entity_id)
                jobs.append(("send_exam_result_notification_task", payload))
        await self.repo.commit()
        job_name: str
        payload: dict[str, Any]
        for job_name, payload in jobs:
            await enqueue_func(job_name, payload)
        return len(jobs)
