from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock

import arq
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

import app.core.redis as redis_module
from app.core.config import settings
from app.models.user import User
from app.services.document_service import DocumentService


class FakeDocumentUpload:
    filename: str = "wp13-probe.txt"
    content_type: str = "text/plain"

    def __init__(self) -> None:
        self.remaining: bytes = b"wp13 synthetic document"

    async def read(self, size: int = -1) -> bytes:
        chunk: bytes = self.remaining if size < 0 else self.remaining[:size]
        self.remaining = self.remaining[len(chunk):]
        return chunk


@pytest.mark.asyncio
async def test_document_producer_delegates_to_shared_arq_enqueue(
    monkeypatch: pytest.MonkeyPatch,
    test_admin: User,
    test_student: User,
    tmp_path: Path,
) -> None:
    from datetime import date
    from decimal import Decimal

    from sqlalchemy import select

    from app.models.course import Course
    from app.models.document import Document
    from app.models.journal import Journal
    from app.models.journal_student_summary import JournalStudentSummary
    from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
    from app.services.outbox_service import NotificationIntentPayload, OutboxPayloadEncryptor
    from app.services.storage_service import LocalStorageService
    from app.tests.conftest import TestingSessionLocal
    from app.workers.outbox import OutboxWorkerManager

    enqueue_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
    producer_creations: list[Any] = []
    shared_producer: AsyncMock = AsyncMock()

    async def record_enqueue(job_name: str, *args: Any, **kwargs: Any) -> None:
        enqueue_calls.append((job_name, args, kwargs))

    async def create_shared_producer(redis_settings: Any) -> AsyncMock:
        producer_creations.append(redis_settings)
        return shared_producer

    await redis_module.close_arq_pool()
    shared_producer.enqueue_job.side_effect = record_enqueue
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(arq, "create_pool", create_shared_producer)
    worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
    session: AsyncSession
    try:
        async with TestingSessionLocal() as session:
            course: Course = Course(title="WP13 outbox", description="synthetic", start_date=date(2025, 1, 1),
                end_date=date(2026, 1, 1), exam_type="monthly", price=Decimal("10.00"), mentor_id=test_admin.id)
            session.add(course)
            await session.flush()
            journal: Journal = Journal(course_id=course.id, period_label="1", period_start=date(2025, 1, 1),
                period_end=date(2025, 1, 28), period_type="monthly")
            session.add(journal)
            await session.flush()
            session.add(JournalStudentSummary(journal_id=journal.id, student_id=test_student.id, exam_score=1))
            await session.commit()

        async with TestingSessionLocal() as session:
            service: DocumentService = DocumentService(session, LocalStorageService(str(tmp_path)))
            document: Document = await service.upload_document(
                cast(UploadFile, FakeDocumentUpload()), "student", test_student.id, journal.id, test_admin,
            )
            event: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
            event_id: int = event.id
            document_id: int = document.id
            assert event.kind == OutboxEventKind.DOCUMENT_NOTIFICATION
            assert event.status == OutboxEventStatus.PENDING
            assert event.correlation_key == f"document:{document.id}"
            assert event.encrypted_payload is not None
            payload: NotificationIntentPayload = NotificationIntentPayload.model_validate_json(
                OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload)
            )
            assert (payload.student_id, payload.journal_id) == (test_student.id, journal.id)
            observer: AsyncSession
            async with TestingSessionLocal() as observer:
                assert await observer.get(Document, document.id) is None
                assert await observer.get(OutboxEvent, event.id) is None
            assert await worker.run_once(TestingSessionLocal) == 0
            assert enqueue_calls == []
            assert producer_creations == []
            await session.commit()

        assert await worker.run_once(TestingSessionLocal) == 1
        assert enqueue_calls == [
            ("send_student_document_notification_task", (test_student.id, journal.id),
                {"_job_id": f"outbox-notification:{event_id}"})
        ]
        assert len(producer_creations) == 1
        assert await redis_module.get_arq_pool() is shared_producer
        assert len(producer_creations) == 1
        async with TestingSessionLocal() as session:
            delivered: OutboxEvent | None = await session.get(OutboxEvent, event_id)
            assert delivered is not None
            assert delivered.status == OutboxEventStatus.DELIVERED
            assert len(list((await session.scalars(select(Document))).all())) == 1
            assert await session.get(Document, document_id) is not None
    finally:
        await redis_module.close_arq_pool()
    shared_producer.aclose.assert_awaited_once()
