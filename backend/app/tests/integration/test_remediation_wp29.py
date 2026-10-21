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
    @pytest.mark.parametrize("kind", ["document"])
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

    @pytest.mark.parametrize("kind", ["document"])
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

    @pytest.mark.parametrize("kind", ["document"])
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
                await scenario.change(session, "document")
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
            assert info.function == "send_student_document_notification_task"
            assert info.args == (test_student.id, scenario.journal.id)
            async with TestingSessionLocal() as session:
                delivered: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
                assert delivered.status == OutboxEventStatus.DELIVERED
        finally:
            if job_id is not None:
                await pool.zrem("arq:queue", job_id)
                await pool.delete(f"arq:job:{job_id}", f"arq:result:{job_id}")
            await pool.aclose()
