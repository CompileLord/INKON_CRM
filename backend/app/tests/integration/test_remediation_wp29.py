import asyncio
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import UploadFile
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import Headers

from app.core import redis as redis_module
from app.core.config import settings
from app.models.course import Course
from app.models.document import Document
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User
from app.services import document_service as document_module
from app.services.document_service import DocumentService
from app.services.journal_service import JournalService
from app.services.outbox_service import OutboxPayloadEncryptor
from app.services.storage_service import LocalStorageService
from app.tests.conftest import TestingSessionLocal
from app.workers import tasks as worker_tasks
from app.workers.outbox import OutboxWorkerManager


class NotificationScenario:
    def __init__(self, student: User, admin: User, journal: Journal, storage: Path) -> None:
        self.student: User = student
        self.admin: User = admin
        self.journal: Journal = journal
        self.storage: LocalStorageService = LocalStorageService(str(storage))

    @classmethod
    async def create(cls, student: User, admin: User, storage: Path) -> "NotificationScenario":
        session: AsyncSession
        async with TestingSessionLocal() as session:
            persisted_student: User | None = await session.get(User, student.id)
            assert persisted_student is not None
            persisted_student.parent_telegram_chat_id = 777
            course: Course = Course(title="Outbox", description="Outbox", start_date=date(2025, 1, 1),
                end_date=date(2026, 1, 1), exam_type="monthly", price=Decimal("10.00"), mentor_id=admin.id)
            session.add(course)
            await session.flush()
            journal: Journal = Journal(course_id=course.id, period_label="1", period_start=date(2025, 1, 1),
                period_end=date(2025, 1, 28), period_type="monthly")
            session.add(journal)
            await session.flush()
            session.add(JournalStudentSummary(journal_id=journal.id, student_id=student.id, exam_score=10,
                sum_score=10, max_period_score=70))
            await session.commit()
            return cls(student, admin, journal, storage)

    async def change(self, session: AsyncSession, kind: str) -> None:
        if kind == "exam":
            summary: JournalStudentSummary = (await session.execute(select(JournalStudentSummary))).scalar_one()
            await JournalService(session).update_exam_or_bonus(self.journal.id, self.student.id, 20, 0,
                summary.version, self.admin)
        else:
            upload: UploadFile = UploadFile(filename="report.pdf", file=io.BytesIO(b"%PDF wp29"),
                headers=Headers({"content-type": "application/pdf"}))
            await DocumentService(session, self.storage).upload_document(upload, "student", self.student.id,
                self.journal.id, self.admin)


class RecordingProducer:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self.states: list[tuple[int, int]] = []
        self.fail: bool = False

    async def enqueue_job(self, name: str, *args: Any, **kwargs: Any) -> object:
        self.calls.append((name, args, kwargs))
        if self.fail:
            raise RedisConnectionError("injected Redis outage")
        session: AsyncSession
        async with TestingSessionLocal() as session:
            score: int = (await session.execute(select(JournalStudentSummary.exam_score))).scalar_one()
            documents: list[Document] = list((await session.scalars(select(Document))).all())
            self.states.append((score, len(documents)))
        return object()


class RecordingBot:
    def __init__(self) -> None:
        self.messages: list[str] = []
        self.documents: list[bytes] = []

    async def send_message(self, chat_id: int | str, text: str) -> None:
        self.messages.append(text)

    async def send_document(self, chat_id: int | str, document: Any, caption: str) -> None:
        content: bytearray = bytearray()
        chunk: bytes
        async for chunk in document.read(self):
            content.extend(chunk)
        self.documents.append(bytes(content))
        self.messages.append(caption)


class TestNotificationOutbox:
    @pytest.mark.parametrize("kind", ["exam", "document"])
    async def test_old_notification_retries_through_last_attempt_while_same_age_email_expires(
        self, kind: str, test_student: User, test_admin: User,
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        producer: RecordingProducer = RecordingProducer()
        producer.fail = True
        monkeypatch.setattr(redis_module, "get_arq_pool", AsyncMock(return_value=producer))
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        now: datetime = datetime.now(timezone.utc)
        queued_at: datetime = now - timedelta(seconds=worker.max_queue_age_seconds + 60)
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await scenario.change(session, kind)
            notification: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
            notification.created_at = queued_at
            notification.max_attempts = 2
            notification_id: int = notification.id
            email: OutboxEvent = OutboxEvent(
                kind=OutboxEventKind.VERIFICATION_EMAIL,
                status=OutboxEventStatus.PENDING,
                recipient_email="queue-age@example.com",
                subject="Queue age probe",
                encrypted_payload=OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).encrypt("123456"),
                created_at=queued_at,
                next_attempt_at=now,
                expires_at=now + timedelta(days=1),
                max_attempts=5,
            )
            session.add(email)
            await session.flush()
            email_id: int = email.id
            await session.commit()

        assert await worker.run_once(TestingSessionLocal) == 2
        async with TestingSessionLocal() as session:
            pending: OutboxEvent | None = await session.get(OutboxEvent, notification_id)
            expired: OutboxEvent | None = await session.get(OutboxEvent, email_id)
            assert pending is not None and expired is not None
            assert pending.status == OutboxEventStatus.PENDING
            assert pending.attempt_count == 1
            assert pending.encrypted_payload is not None
            assert expired.status == OutboxEventStatus.EXPIRED
            assert expired.last_error == "event_exceeded_maximum_queue_age"
            pending.next_attempt_at = datetime.now(timezone.utc)
            await session.commit()
        assert len(producer.calls) == 1

        producer.fail = False
        assert await worker.run_once(TestingSessionLocal) == 1
        assert len(producer.calls) == 2
        assert producer.calls[0][2]["_job_id"] == producer.calls[1][2]["_job_id"]
        assert producer.states == ([(20, 0)] if kind == "exam" else [(10, 1)])
        async with TestingSessionLocal() as session:
            delivered: OutboxEvent | None = await session.get(OutboxEvent, notification_id)
            assert delivered is not None
            assert delivered.status == OutboxEventStatus.DELIVERED
            assert delivered.attempt_count == delivered.max_attempts == 2
            assert delivered.encrypted_payload is None
            expired = await session.get(OutboxEvent, email_id)
            assert expired is not None and expired.status == OutboxEventStatus.EXPIRED

    @pytest.mark.parametrize("kind", ["exam", "document"])
    @pytest.mark.parametrize("commit", [True, False])
    async def test_worker_cannot_publish_before_commit_and_rollback_has_no_intent(
        self, kind: str, commit: bool, test_student: User, test_admin: User,
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "TESTING", False)
        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        producer: RecordingProducer = RecordingProducer()
        producer_factory: AsyncMock = AsyncMock(return_value=producer)
        monkeypatch.setattr(redis_module, "get_arq_pool", producer_factory)
        direct_enqueue: AsyncMock = AsyncMock()
        monkeypatch.setattr(redis_module, "enqueue_job", direct_enqueue)
        monkeypatch.setattr(document_module, "enqueue_job", direct_enqueue, raising=False)
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        worker_ready: asyncio.Event = asyncio.Event()
        request_changed: asyncio.Event = asyncio.Event()

        async def poll_before_commit() -> int:
            worker_ready.set()
            await request_changed.wait()
            return await worker.run_once(TestingSessionLocal)

        polling: asyncio.Task[int] = asyncio.create_task(poll_before_commit())
        await worker_ready.wait()
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await scenario.change(session, kind)
            request_changed.set()
            assert await asyncio.wait_for(polling, 5) == 0
            assert not producer.calls
            direct_enqueue.assert_not_awaited()
            if commit:
                await session.commit()
            else:
                await session.rollback()
        assert await worker.run_once(TestingSessionLocal) == (1 if commit else 0)
        assert len(producer.calls) == (1 if commit else 0)
        if not commit:
            async with TestingSessionLocal() as session:
                assert list((await session.scalars(select(OutboxEvent))).all()) == []
                assert (await session.scalar(select(JournalStudentSummary.exam_score))) == 10
                assert list((await session.scalars(select(Document))).all()) == []
        if commit:
            assert producer.states == ([(20, 0)] if kind == "exam" else [(10, 1)])
            assert producer.calls[0][2]["_job_id"].startswith("outbox-notification:")
            bot: RecordingBot = RecordingBot()
            monkeypatch.setattr(worker_tasks, "bot", bot)
            monkeypatch.setattr(worker_tasks, "get_storage_service", lambda: scenario.storage)
            await getattr(worker_tasks, producer.calls[0][0])({}, *producer.calls[0][1])
            assert len(bot.messages) == 1
            assert f"Sum = {20 if kind == 'exam' else 10}/" in bot.messages[0]
            assert bot.documents == ([] if kind == "exam" else [b"%PDF wp29"])

    @pytest.mark.parametrize("kind", ["exam", "document"])
    async def test_redis_failure_retains_intent_and_retries_with_stable_id(
        self, kind: str, test_student: User, test_admin: User,
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        producer: RecordingProducer = RecordingProducer()
        producer.fail = True
        monkeypatch.setattr(redis_module, "get_arq_pool", AsyncMock(return_value=producer))
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await scenario.change(session, kind)
            await session.commit()
        assert await worker.run_once(TestingSessionLocal) == 1
        async with TestingSessionLocal() as session:
            event: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
            assert event.status == OutboxEventStatus.PENDING
            assert event.encrypted_payload is not None
            assert event.attempt_count == 1
            event.next_attempt_at = datetime.now(timezone.utc)
            await session.commit()
        producer.fail = False
        assert await worker.run_once(TestingSessionLocal) == 1
        assert len(producer.calls) == 2
        assert producer.calls[0][2]["_job_id"] == producer.calls[1][2]["_job_id"]
        async with TestingSessionLocal() as session:
            delivered: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
            assert delivered.status == OutboxEventStatus.DELIVERED
            assert delivered.encrypted_payload is None

    async def test_repeated_uploads_do_not_create_request_pools(
        self, test_student: User, test_admin: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import arq

        monkeypatch.setattr(settings, "TESTING", False)
        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        pool_creation: AsyncMock = AsyncMock(side_effect=AssertionError("request opened ARQ pool"))
        monkeypatch.setattr(arq, "create_pool", pool_creation)
        producer_access: AsyncMock = AsyncMock(side_effect=AssertionError("request accessed producer"))
        monkeypatch.setattr(redis_module, "get_arq_pool", producer_access)
        session: AsyncSession
        async with TestingSessionLocal() as session:
            upload_index: int
            for upload_index in range(3):
                await scenario.change(session, "document")
            await session.commit()
        pool_creation.assert_not_awaited()
        producer_access.assert_not_awaited()
        async with TestingSessionLocal() as session:
            events: list[OutboxEvent] = list((await session.scalars(select(OutboxEvent))).all())
            assert len(events) == 3

    async def test_real_redis_dispatch_reuses_job_after_lost_acknowledgement(
        self, test_student: User, test_admin: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from arq import create_pool
        from arq.connections import ArqRedis
        from arq.jobs import Job

        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        pool: ArqRedis = await create_pool(redis_module.redis_connection_configuration.create_arq_settings())
        original_enqueue: Any = pool.enqueue_job
        acknowledgement_lost: bool = True

        async def enqueue_with_lost_acknowledgement(*args: Any, **kwargs: Any) -> Any:
            nonlocal acknowledgement_lost
            result: Any = await original_enqueue(*args, **kwargs)
            if acknowledgement_lost:
                acknowledgement_lost = False
                raise RedisConnectionError("Redis reply lost after enqueue")
            return result

        monkeypatch.setattr(pool, "enqueue_job", enqueue_with_lost_acknowledgement)
        monkeypatch.setattr(redis_module, "get_arq_pool", AsyncMock(return_value=pool))
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        session: AsyncSession
        job_id: str | None = None
        try:
            async with TestingSessionLocal() as session:
                await scenario.change(session, "exam")
                await session.commit()
                event: OutboxEvent | None = await session.scalar(select(OutboxEvent))
                assert event is not None
                job_id = f"outbox-notification:{event.id}"
            assert await worker.run_once(TestingSessionLocal) == 1
            async with TestingSessionLocal() as session:
                pending: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
                assert pending.status == OutboxEventStatus.PENDING
                pending.next_attempt_at = datetime.now(timezone.utc)
                await session.commit()
            assert await worker.run_once(TestingSessionLocal) == 1
            info: Any = await Job(job_id, pool).info()
            assert info is not None
            assert info.function == "send_exam_result_notification_task"
            assert info.args == (test_student.id, scenario.journal.id)
            async with TestingSessionLocal() as session:
                delivered: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
                assert delivered.status == OutboxEventStatus.DELIVERED
        finally:
            if job_id is not None:
                await pool.zrem("arq:queue", job_id)
                await pool.delete(f"arq:job:{job_id}", f"arq:result:{job_id}")
            await pool.aclose()

    async def test_upload_producer_lifecycle_measurements(
        self, test_student: User, test_admin: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import json
        from statistics import mean, pstdev
        from time import perf_counter

        import arq
        from redis.asyncio import Redis

        from app.workers.settings import outbox_worker_shutdown

        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        observer: Redis = Redis.from_url(settings.REDIS_URL)
        pool_creation: AsyncMock = AsyncMock(wraps=arq.create_pool)
        monkeypatch.setattr(arq, "create_pool", pool_creation)
        monkeypatch.setattr(settings, "TESTING", False)
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        transaction_seconds: list[float] = []
        trials: list[dict[str, Any]] = []
        uploads: int = 3
        trial: int
        session: AsyncSession
        await redis_module.close_arq_pool()
        try:
            for trial in range(3):
                pool_creation.reset_mock()
                baseline_clients: int = int((await observer.info("clients"))["connected_clients"])
                started_at: float = perf_counter()
                async with TestingSessionLocal() as session:
                    upload_index: int
                    for upload_index in range(uploads):
                        await scenario.change(session, "document")
                    await session.commit()
                transaction_seconds.append(perf_counter() - started_at)
                request_pool_creations: int = pool_creation.await_count
                clients_after_requests: int = int((await observer.info("clients"))["connected_clients"])
                dispatched: int = await worker.run_once(TestingSessionLocal)
                dispatch_pool_creations: int = pool_creation.await_count
                clients_after_dispatch: int = int((await observer.info("clients"))["connected_clients"])
                await outbox_worker_shutdown({})
                clients_after_shutdown: int = int((await observer.info("clients"))["connected_clients"])
                trials.append({"trial": trial, "uploads": uploads,
                    "request_pool_creations": request_pool_creations, "total_pool_creations": dispatch_pool_creations,
                    "dispatched": dispatched, "clients_baseline": baseline_clients,
                    "clients_after_requests": clients_after_requests, "clients_after_dispatch": clients_after_dispatch,
                    "clients_after_shutdown": clients_after_shutdown, "transaction_seconds": transaction_seconds[-1]})
                queued_job: bytes
                for queued_job in await observer.zrange("arq:queue", 0, -1):
                    await observer.delete(b"arq:job:" + queued_job, b"arq:result:" + queued_job)
                await observer.delete("arq:queue")
                await redis_module.close_arq_pool()
            print(json.dumps({"trials": trials, "transaction_mean_seconds": mean(transaction_seconds),
                "transaction_stdev_seconds": pstdev(transaction_seconds)}))
            assert all(result["request_pool_creations"] == 0 for result in trials)
            assert all(result["total_pool_creations"] == 1 for result in trials)
            assert all(result["dispatched"] == uploads for result in trials)
            assert all(result["clients_after_requests"] == result["clients_baseline"] for result in trials)
            assert all(result["clients_after_shutdown"] == result["clients_baseline"] for result in trials)
        finally:
            await redis_module.close_arq_pool()
            await observer.aclose()
