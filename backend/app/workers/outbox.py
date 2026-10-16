import asyncio
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.redis import redis_client
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.email_service import EmailDeliveryError, EmailService, SMTP_SOCKET_TIMEOUT_SECONDS
from app.services.outbox_service import OutboxPayloadEncryptor

logger = logging.getLogger(__name__)

OUTBOX_WORKER_BATCH_SIZE = 10
OUTBOX_WORKER_LEASE_SECONDS = 60
OUTBOX_WORKER_POLL_INTERVAL_SECONDS = 5.0
OUTBOX_WORKER_BACKOFF_BASE_SECONDS = 10
OUTBOX_WORKER_MAX_QUEUE_AGE_SECONDS = 600
OUTBOX_WORKER_MIN_LEASE_REMAINING_SECONDS = max(12.0, SMTP_SOCKET_TIMEOUT_SECONDS + 2.0)


class OutboxWorkerManager:
    def __init__(
        self,
        database_url: str,
        payload_master_key: str,
        email_service: Optional[EmailService] = None,
        batch_size: int = OUTBOX_WORKER_BATCH_SIZE,
        lease_duration_seconds: int = OUTBOX_WORKER_LEASE_SECONDS,
        poll_interval_seconds: float = OUTBOX_WORKER_POLL_INTERVAL_SECONDS,
        backoff_base_seconds: int = OUTBOX_WORKER_BACKOFF_BASE_SECONDS,
        max_queue_age_seconds: int = OUTBOX_WORKER_MAX_QUEUE_AGE_SECONDS,
        min_lease_remaining_seconds: float = OUTBOX_WORKER_MIN_LEASE_REMAINING_SECONDS,
    ) -> None:
        self.database_url = database_url
        self.payload_master_key = payload_master_key
        self.email_service = email_service or EmailService()
        self.encryptor = OutboxPayloadEncryptor(payload_master_key)
        self.batch_size = batch_size
        self.lease_duration_seconds = lease_duration_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.backoff_base_seconds = backoff_base_seconds
        self.max_queue_age_seconds = max_queue_age_seconds
        self.min_lease_remaining_seconds = min_lease_remaining_seconds
        self._engine: Optional[AsyncEngine] = None
        self._session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        self._stop_event: Optional[asyncio.Event] = None
        self._worker_task: Optional[asyncio.Task[None]] = None
        self._inflight_transports: Set[asyncio.Task[None]] = set()

    def compute_next_attempt_at(self, attempt_count: int, now: datetime) -> datetime:
        backoff_seconds = min(
            self.backoff_base_seconds * (2 ** max(0, attempt_count - 1)),
            300,
        )
        return now + timedelta(seconds=backoff_seconds)

    async def check_verification_state(
        self,
        event: OutboxEvent,
        code: str,
        session: AsyncSession,
    ) -> tuple[bool, str]:
        user_repository: UserRepository = SQLAlchemyUserRepository(session)
        if event.kind == OutboxEventKind.VERIFICATION_EMAIL:
            user = await user_repository.get_by_email(event.recipient_email)
            if not user or not user.must_set_password:
                return False, "user_state_invalid_or_password_already_set"

            redis_key = f"auth:code:{event.recipient_email}"
            raw_data = await redis_client.get(redis_key)
            if not raw_data:
                return False, "verification_code_expired_in_cache"
            try:
                cached = json.loads(raw_data)
                if cached.get("code") != code:
                    return False, "verification_code_superseded"
            except (json.JSONDecodeError, TypeError):
                return False, "verification_cache_corrupted"

            return True, ""

        elif event.kind == OutboxEventKind.PASSWORD_RESET_EMAIL:
            user = await user_repository.get_by_email(event.recipient_email)
            if not user:
                return False, "user_not_found_or_deleted"

            redis_key = f"auth:reset:{event.recipient_email}"
            raw_data = await redis_client.get(redis_key)
            if not raw_data:
                return False, "reset_code_expired_in_cache"
            try:
                cached = json.loads(raw_data)
                if cached.get("code") != code:
                    return False, "reset_code_superseded"
            except (json.JSONDecodeError, TypeError):
                return False, "reset_cache_corrupted"

            return True, ""

        return False, f"unsupported_event_kind_{event.kind}"

    async def process_single_event(
        self,
        event: OutboxEvent,
        lease_owner: str,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> bool:
        now = datetime.now(timezone.utc)

        if event.expires_at is not None and event.expires_at <= now:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_expired(event.id, lease_owner, "event_expired_before_delivery", now)
                await session.commit()
            return True

        if (now - event.created_at).total_seconds() > self.max_queue_age_seconds:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_expired(event.id, lease_owner, "event_exceeded_maximum_queue_age", now)
                await session.commit()
            return True

        if event.lease_expires_at is None or (event.lease_expires_at - now).total_seconds() < self.min_lease_remaining_seconds:
            return False

        if event.encrypted_payload is None:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_failed(
                    event_id=event.id,
                    lease_owner=lease_owner,
                    error_summary="payload_missing_or_purged",
                    next_attempt_at=None,
                    now=now,
                    terminal=True,
                )
                await session.commit()
            return True

        try:
            code = self.encryptor.decrypt(event.encrypted_payload)
        except Exception:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_failed(
                    event_id=event.id,
                    lease_owner=lease_owner,
                    error_summary="payload_decryption_failed",
                    next_attempt_at=None,
                    now=now,
                    terminal=True,
                )
                await session.commit()
            return True

        async with session_factory() as session:
            is_valid, invalidate_reason = await self.check_verification_state(event, code, session)
        if not is_valid:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_expired(event.id, lease_owner, invalidate_reason, now)
                await session.commit()
            return True

        async with session_factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            lease_still_valid = await repo.is_lease_valid(event.id, lease_owner, datetime.now(timezone.utc))
        if not lease_still_valid:
            return False

        if event.kind == OutboxEventKind.VERIFICATION_EMAIL:
            body = f"Your verification code is: {code}"
        else:
            body = f"Your password reset code is: {code}"

        send_error: Optional[str] = None
        transport_task = asyncio.create_task(
            self.email_service.send_email(
                to_email=event.recipient_email,
                subject=event.subject,
                body=body,
                force_transport=True,
            )
        )
        self._inflight_transports.add(transport_task)
        try:
            await asyncio.shield(transport_task)
        except EmailDeliveryError as exc:
            send_error = type(exc).__name__
        except asyncio.CancelledError:
            try:
                await transport_task
            except Exception as exc:
                send_error = type(exc).__name__
        except Exception as exc:
            send_error = type(exc).__name__
        finally:
            self._inflight_transports.discard(transport_task)

        settle_now = datetime.now(timezone.utc)
        async with session_factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            if send_error is None:
                await repo.mark_delivered(event.id, lease_owner, settle_now)
            else:
                reached_max = event.attempt_count >= event.max_attempts
                next_attempt_at: Optional[datetime] = None
                if not reached_max:
                    next_attempt_at = self.compute_next_attempt_at(event.attempt_count, settle_now)
                await repo.mark_failed(
                    event_id=event.id,
                    lease_owner=lease_owner,
                    error_summary=send_error,
                    next_attempt_at=next_attempt_at,
                    now=settle_now,
                    terminal=reached_max,
                )
            await session.commit()
        return True

    async def run_once(
        self,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
    ) -> int:
        active_factory = session_factory or self._session_factory
        if active_factory is None:
            raise RuntimeError("Outbox worker has no active session factory")

        lease_owner = secrets.token_hex(16)
        now = datetime.now(timezone.utc)

        async with active_factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            await repo.release_stale_leases(now)
            await repo.expire_stale(now)
            await session.commit()

        async with active_factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            claimed = await repo.claim_pending_batch(
                lease_owner=lease_owner,
                lease_duration_seconds=self.lease_duration_seconds,
                batch_size=self.batch_size,
                now=now,
            )
            await session.commit()

        for event in claimed:
            if self._stop_event is not None and self._stop_event.is_set():
                break
            await self.process_single_event(
                event=event,
                lease_owner=lease_owner,
                session_factory=active_factory,
            )

        return len(claimed)

    async def run_loop(self) -> None:
        while self._stop_event is not None and not self._stop_event.is_set():
            try:
                await self.run_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Outbox worker iteration failed: %s", type(exc).__name__)
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.poll_interval_seconds,
                )
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass

    async def start(self) -> None:
        self._engine = create_async_engine(
            self.database_url,
            pool_pre_ping=True,
            pool_size=2,
            max_overflow=2,
        )
        self._session_factory = async_sessionmaker(self._engine, expire_on_commit=False)
        self._stop_event = asyncio.Event()
        self._worker_task = asyncio.create_task(self.run_loop())

    async def stop(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except (asyncio.CancelledError, Exception):
                pass
            self._worker_task = None
        if self._inflight_transports:
            try:
                await asyncio.gather(*list(self._inflight_transports), return_exceptions=True)
            except (asyncio.TimeoutError, Exception):
                pass
            self._inflight_transports.clear()
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None


async def run_outbox_worker_once(
    session_factory: async_sessionmaker[AsyncSession],
    payload_master_key: str,
    email_service: Optional[EmailService] = None,
) -> int:
    worker = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=payload_master_key,
        email_service=email_service,
    )
    return await worker.run_once(session_factory)
