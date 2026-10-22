import asyncio
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence, Set

from arq.connections import ArqRedis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core import redis as redis_module
from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import verify_password
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.repositories.interfaces.user_repository import UserRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.email_service import EmailDeliveryError, EmailService, SMTP_TRANSPORT_TIMEOUT_SECONDS
from app.services.email_templates import OutboxEmailTemplateFactory, RenderedEmail
from app.services.outbox_service import NotificationIntentPayload, OutboxPayloadEncryptor
from app.services.sms.sender import PayomchiSmsSender, SmsSender
from app.workers.sms_delivery import StudentPasswordSmsDispatcher

logger = logging.getLogger(__name__)

OUTBOX_WORKER_BATCH_SIZE = 10
OUTBOX_WORKER_LEASE_SECONDS = 60
OUTBOX_WORKER_POLL_INTERVAL_SECONDS = 5.0
OUTBOX_WORKER_BACKOFF_BASE_SECONDS = 10
OUTBOX_WORKER_MAX_QUEUE_AGE_SECONDS = 600
OUTBOX_WORKER_MIN_LEASE_REMAINING_SECONDS: float = SMTP_TRANSPORT_TIMEOUT_SECONDS + 2.0


class OutboxWorkerManager:
    notification_tasks: dict[OutboxEventKind, str] = {
        OutboxEventKind.EXAM_RESULT_NOTIFICATION: "send_exam_result_notification_task",
        OutboxEventKind.DOCUMENT_NOTIFICATION: "send_student_document_notification_task",
    }

    def __init__(
        self,
        database_url: str,
        payload_master_key: str,
        email_service: Optional[EmailService] = None,
        sms_sender: Optional[SmsSender] = None,
        sms_send_interval_seconds: float = 0.2,
        sms_jitter_fraction: float = 0.25,
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
        self.encryptor: OutboxPayloadEncryptor = OutboxPayloadEncryptor.from_settings(payload_master_key)
        self.template_factory = OutboxEmailTemplateFactory()
        self.sms_dispatcher = StudentPasswordSmsDispatcher(
            sender=sms_sender or PayomchiSmsSender(),
            send_interval_seconds=sms_send_interval_seconds,
            jitter_fraction=sms_jitter_fraction,
            backoff_base_seconds=backoff_base_seconds,
        )
        self.batch_size = batch_size
        self.lease_duration_seconds = lease_duration_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.backoff_base_seconds = backoff_base_seconds
        self.max_queue_age_seconds = max_queue_age_seconds
        self.min_lease_remaining_seconds = max(min_lease_remaining_seconds, OUTBOX_WORKER_MIN_LEASE_REMAINING_SECONDS)
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

    async def dispatch_notification(
        self,
        event: OutboxEvent,
        plaintext: str,
        lease_owner: str,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> bool:
        session: AsyncSession
        async with session_factory() as session:
            repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(session)
            attempt_count: int | None = await repository.begin_attempt(
                event.id, lease_owner, datetime.now(timezone.utc), self.min_lease_remaining_seconds,
            )
            if attempt_count is None:
                await repository.release_claim(event.id, lease_owner)
                await session.commit()
                return False
            event.attempt_count = attempt_count
            await session.commit()

        send_error: str | None = None
        try:
            payload: NotificationIntentPayload = NotificationIntentPayload.model_validate_json(plaintext)
            producer: ArqRedis = await redis_module.get_arq_pool()
            await producer.enqueue_job(
                self.notification_tasks[event.kind],
                payload.student_id,
                payload.journal_id,
                _job_id=f"outbox-notification:{event.id}",
            )
        except Exception as error:
            send_error = type(error).__name__

        settled_at: datetime = datetime.now(timezone.utc)
        async with session_factory() as session:
            repository = SQLAlchemyOutboxRepository(session)
            if send_error is None:
                await repository.mark_delivered(event.id, lease_owner, settled_at)
            else:
                await repository.mark_failed(
                    event.id,
                    lease_owner,
                    send_error,
                    self.compute_next_attempt_at(event.attempt_count, settled_at),
                    settled_at,
                )
            await session.commit()
        return True

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

        elif event.kind == OutboxEventKind.CREDENTIALS_EMAIL:
            user = await user_repository.get_by_email(event.recipient_email)
            if not user or not user.must_set_password:
                return False, "user_state_invalid_or_password_already_set"

            try:
                temporary_password: str = json.loads(code)["temporary_password"]
            except (json.JSONDecodeError, KeyError, TypeError):
                return False, "credentials_payload_corrupted"
            if not user.password_hash or not verify_password(temporary_password, user.password_hash):
                return False, "credentials_superseded"

            return True, ""

        return False, f"unsupported_event_kind_{event.kind}"

    def render_email(self, event: OutboxEvent, payload: str) -> RenderedEmail:
        return self.template_factory.create(event.kind, event.recipient_email, payload).render()

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

        if event.kind not in self.notification_tasks and event.kind != OutboxEventKind.STUDENT_PASSWORD_SMS and (now - event.created_at).total_seconds() > self.max_queue_age_seconds:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_expired(event.id, lease_owner, "event_exceeded_maximum_queue_age", now)
                await session.commit()
            return True

        if event.lease_expires_at is None or (event.lease_expires_at - now).total_seconds() < self.min_lease_remaining_seconds:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.release_claim(event.id, lease_owner)
                await session.commit()
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

        if event.kind in self.notification_tasks:
            return await self.dispatch_notification(event, code, lease_owner, session_factory)

        if event.kind == OutboxEventKind.STUDENT_PASSWORD_SMS:
            return await self.sms_dispatcher.dispatch(event, code, lease_owner, session_factory)

        async with session_factory() as session:
            is_valid, invalidate_reason = await self.check_verification_state(event, code, session)
        if not is_valid:
            async with session_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                await repo.mark_expired(event.id, lease_owner, invalidate_reason, now)
                await session.commit()
            return True

        rendered_email: RenderedEmail = self.render_email(event, code)
        async with session_factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            attempt_count: int | None = await repo.begin_attempt(
                event.id, lease_owner, datetime.now(timezone.utc), self.min_lease_remaining_seconds,
            )
            if attempt_count is None:
                await repo.release_claim(event.id, lease_owner)
                await session.commit()
                return False
            event.attempt_count = attempt_count
            await session.commit()

        send_error: Optional[str] = None
        transport_task = asyncio.create_task(
            self.email_service.send_email(
                to_email=event.recipient_email,
                subject=rendered_email.subject,
                body=rendered_email.plain_text,
                force_transport=True,
                html_body=rendered_email.html_body,
                inline_images=rendered_email.inline_images,
            )
        )
        self._inflight_transports.add(transport_task)
        try:
            await asyncio.wait_for(asyncio.shield(transport_task), SMTP_TRANSPORT_TIMEOUT_SECONDS + 0.5)
        except asyncio.TimeoutError:
            transport_task.cancel()
            await asyncio.gather(transport_task, return_exceptions=True)
            send_error = "TimeoutError"
        except EmailDeliveryError as exc:
            send_error = type(exc).__name__
        except asyncio.CancelledError:
            try:
                await asyncio.wait_for(transport_task, SMTP_TRANSPORT_TIMEOUT_SECONDS + 0.5)
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

        claimed_count: int = 0
        iteration_index: int
        for iteration_index in range(self.batch_size):
            if self._stop_event is not None and self._stop_event.is_set():
                break
            async with active_factory() as session:
                repo = SQLAlchemyOutboxRepository(session)
                claimed: Sequence[OutboxEvent] = await repo.claim_pending_batch(
                    lease_owner=lease_owner,
                    lease_duration_seconds=self.lease_duration_seconds,
                    batch_size=1,
                    now=datetime.now(timezone.utc),
                )
                await session.commit()
            if not claimed:
                break
            event: OutboxEvent = claimed[0]
            claimed_count += 1
            original_attempt_count: int = event.attempt_count
            try:
                processed: bool = await self.process_single_event(event, lease_owner, active_factory)
            finally:
                async with active_factory() as session:
                    repo = SQLAlchemyOutboxRepository(session)
                    if event.attempt_count == original_attempt_count:
                        await repo.release_claim(event.id, lease_owner)
                    await session.commit()
            if not processed:
                break
        return claimed_count

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
            **settings.main_engine_options(outbox=True),
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
        await self.sms_dispatcher.close()
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
