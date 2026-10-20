import asyncio
import json
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import PasswordWorkService
from app.models.outbox_event import OutboxEvent
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.sms.messages import PasswordSmsMessageFactory, PasswordSmsReason
from app.services.sms.sender import SmsDeliveryError, SmsSender, SmsSendResult


class StudentPasswordSmsDispatcher:
    MAXIMUM_BACKOFF_SECONDS: int = 900

    def __init__(
        self,
        sender: SmsSender,
        send_interval_seconds: float,
        jitter_fraction: float,
        backoff_base_seconds: int,
    ) -> None:
        self._sender: SmsSender = sender
        self._send_interval_seconds: float = send_interval_seconds
        self._jitter_fraction: float = jitter_fraction
        self._backoff_base_seconds: int = backoff_base_seconds
        self._message_factory: PasswordSmsMessageFactory = PasswordSmsMessageFactory()
        self._password_work_service: PasswordWorkService = PasswordWorkService()

    def compute_next_attempt_at(self, attempt_count: int, now: datetime) -> datetime:
        backoff_seconds: float = min(
            self._backoff_base_seconds * (2 ** max(0, attempt_count - 1)),
            self.MAXIMUM_BACKOFF_SECONDS,
        )
        jitter_seconds: float = random.uniform(0, backoff_seconds * self._jitter_fraction)
        return now + timedelta(seconds=backoff_seconds + jitter_seconds)

    @staticmethod
    def idempotency_key_for(event: OutboxEvent) -> str:
        return f"password-sms-{event.id}"

    async def close(self) -> None:
        closer = getattr(self._sender, "aclose", None)
        if closer is not None:
            await closer()

    async def dispatch(
        self,
        event: OutboxEvent,
        plaintext_payload: str,
        lease_owner: str,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> bool:
        invalid_reason: Optional[str] = await self._find_invalid_reason(event, plaintext_payload, session_factory)
        if invalid_reason is not None:
            async with session_factory() as session:
                await SQLAlchemyOutboxRepository(session).mark_expired(
                    event.id, lease_owner, invalid_reason, datetime.now(timezone.utc)
                )
                await session.commit()
            return True

        async with session_factory() as session:
            if not await SQLAlchemyOutboxRepository(session).is_lease_valid(
                event.id, lease_owner, datetime.now(timezone.utc)
            ):
                return False

        payload: dict[str, Optional[str]] = json.loads(plaintext_payload)
        message: str = self._message_factory.build(
            payload.get("language"), PasswordSmsReason(payload["reason"]), str(payload["code"])
        )
        send_result: Optional[SmsSendResult] = None
        failure: Optional[SmsDeliveryError] = None
        if self._send_interval_seconds > 0:
            await asyncio.sleep(self._send_interval_seconds)
        try:
            send_result = await self._sender.send(
                str(event.recipient_phone), message, self.idempotency_key_for(event)
            )
        except SmsDeliveryError as error:
            failure = error

        settled_at: datetime = datetime.now(timezone.utc)
        async with session_factory() as session:
            repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(session)
            if send_result is not None:
                await repository.mark_delivered(
                    event.id, lease_owner, settled_at, send_result.provider_message_id, send_result.status
                )
            elif failure is not None:
                terminal: bool = (not failure.retryable) or event.attempt_count >= event.max_attempts
                await repository.mark_failed(
                    event_id=event.id,
                    lease_owner=lease_owner,
                    error_summary=failure.reason,
                    next_attempt_at=None if terminal else self.compute_next_attempt_at(event.attempt_count, settled_at),
                    now=settled_at,
                    terminal=terminal,
                )
            await session.commit()
        return True

    async def _find_invalid_reason(
        self,
        event: OutboxEvent,
        plaintext_payload: str,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> Optional[str]:
        try:
            payload: dict[str, Optional[str]] = json.loads(plaintext_payload)
            code: str = str(payload["code"])
            PasswordSmsReason(payload["reason"])
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return "sms_payload_corrupted"
        if event.target_user_id is None or not event.recipient_phone:
            return "sms_event_incomplete"
        async with session_factory() as session:
            user = await SQLAlchemyUserRepository(session).get_by_id(event.target_user_id)
        if user is None or user.is_deleted:
            return "user_not_found_or_deleted"
        if not user.password_hash or not await self._password_work_service.verify(code, user.password_hash):
            return "sms_password_superseded"
        return None
