import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document, DocumentOwnerType
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.notification_log import NotificationLog
from app.models.user import User, UserRole
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.wp30_delivery_support import DeliveryFixture
from app.workers import tasks


class ExamFixture:
    @classmethod
    async def document(cls, session: AsyncSession, student: User, journal: Journal, name: str) -> Document:
        document: Document = Document(
            owner_type=DocumentOwnerType.STUDENT,
            owner_id=student.id,
            journal_id=journal.id,
            file_path=f"student/{student.id}/{name}",
            file_name=name,
            file_type="application/pdf",
            file_size=100,
            uploaded_by_id=student.id,
            uploaded_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
        )
        session.add(document)
        await session.commit()
        return document

    @classmethod
    def sender(cls, monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
        sender: AsyncMock = AsyncMock()
        monkeypatch.setattr(tasks, "AsyncSessionLocal", TestingSessionLocal)
        monkeypatch.setattr(tasks.bot, "send_document", sender)
        monkeypatch.setattr(tasks.bot, "send_message", AsyncMock())
        monkeypatch.setattr(
            tasks.StreamedStorageInputFile, "open", AsyncMock(side_effect=lambda storage, path, filename: filename)
        )
        return sender


@pytest.mark.asyncio
async def test_siblings_same_chat_and_score_each_deliver_correct_document(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    sibling: User = User(
        email="sibling@example.invalid",
        password_hash="synthetic",
        first_name="Sibling",
        last_name="Synthetic",
        phone="+992900003131",
        role=UserRole.STUDENT,
        parent_telegram_chat_id=998877,
    )
    db_session.add(sibling)
    await db_session.flush()
    db_session.add(
        JournalStudentSummary(student_id=sibling.id, journal_id=journal.id, sum_score=10, max_period_score=100)
    )
    await db_session.commit()
    await ExamFixture.document(db_session, test_student, journal, "first.pdf")
    await ExamFixture.document(db_session, sibling, journal, "sibling.pdf")
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    await tasks.send_exam_result_notification_task({}, sibling.id, journal.id)
    assert [call.args[1] for call in sender.await_args_list] == ["first.pdf", "sibling.pdf"]
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    await tasks.send_exam_result_notification_task({}, sibling.id, journal.id)
    assert sender.await_count == 2


@pytest.mark.asyncio
async def test_newest_document_same_score_delivers_once(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    await ExamFixture.document(db_session, test_student, journal, "old.pdf")
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    await tasks.send_student_document_notification_task({}, test_student.id, journal.id)
    await ExamFixture.document(db_session, test_student, journal, "new.pdf")
    await tasks.send_student_document_notification_task({}, test_student.id, journal.id)
    await tasks.send_student_document_notification_task({}, test_student.id, journal.id)
    assert [call.args[1] for call in sender.await_args_list] == ["old.pdf", "new.pdf"]


@pytest.mark.asyncio
async def test_cross_date_concurrent_revision_has_one_claim(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
) -> None:
    from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
    from app.services.notification_service import NotificationService

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    summary: JournalStudentSummary = (await db_session.execute(select(JournalStudentSummary))).scalar_one()
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    sends: list[bool] = []

    async def send(is_update: bool) -> None:
        sends.append(is_update)
        entered.set()
        await release.wait()

    async def worker(day: date) -> bool:
        async with TestingSessionLocal() as session:
            await barrier.wait()
            return await NotificationService(SQLAlchemyNotificationLogRepository(session)).send_exam_revision(
                "998877",
                summary.id,
                journal.id,
                test_student.id,
                10,
                "v1:one",
                day,
                send,
            )

    workers: list[asyncio.Task[bool]] = [
        asyncio.create_task(worker(date(2026, 10, 20))),
        asyncio.create_task(worker(date(2026, 10, 21))),
    ]
    await asyncio.wait_for(entered.wait(), 5)
    await asyncio.sleep(0.1)
    release.set()
    assert sorted(await asyncio.gather(*workers)) == [False, True]
    assert sends == [False]
    async with TestingSessionLocal() as session:
        service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(session))
        assert not await service.send_exam_revision(
            "998877",
            summary.id,
            journal.id,
            test_student.id,
            10,
            "v1:one",
            date(2026, 10, 22),
            send,
        )
        logs: list[NotificationLog] = list((await session.execute(select(NotificationLog))).scalars())
        assert len(logs) == 1
        assert logs[0].related_entity_id == -summary.id
        assert logs[0].source_journal_id == journal.id


@pytest.mark.asyncio
async def test_equal_total_summary_revision_and_cross_date_worker_replay(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    await ExamFixture.document(db_session, test_student, journal, "report.pdf")
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    summary: JournalStudentSummary = (await db_session.execute(select(JournalStudentSummary))).scalar_one()
    summary.attendance_count += 1
    await db_session.commit()
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 2
    assert "1/0" in sender.await_args.kwargs["caption"]

    class Tomorrow(date):
        @classmethod
        def today(cls) -> date:
            return date.today() + timedelta(days=1)

    monkeypatch.setattr(tasks, "date", Tomorrow)
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 2


@pytest.mark.asyncio
async def test_fingerprint_retry_budget_new_document_and_stale_finalizer(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
) -> None:
    from arq import Retry
    from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
    from app.repositories.interfaces.notification_log_repository import NotificationClaim
    from app.services.notification_service import NotificationService

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    summary: JournalStudentSummary = (await db_session.execute(select(JournalStudentSummary))).scalar_one()
    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    failing: AsyncMock = AsyncMock(side_effect=RuntimeError("synthetic"))
    attempt: int
    for attempt in range(3):
        if attempt < 2:
            with pytest.raises(Retry):
                await service.send_exam_revision(
                    "998877", summary.id, journal.id, test_student.id, 10, "v1:old", date.today(), failing
                )
        else:
            assert not await service.send_exam_revision(
                "998877", summary.id, journal.id, test_student.id, 10, "v1:old", date.today(), failing
            )
    assert not await service.send_exam_revision(
        "998877", summary.id, journal.id, test_student.id, 10, "v1:old", date.today(), failing
    )
    assert failing.await_count == 3
    log: NotificationLog = (await db_session.execute(select(NotificationLog))).scalar_one()
    stale: NotificationClaim = NotificationClaim(log.id, log.revision or 1, "old-token", 3, False, 10, "998877", None)
    successful: AsyncMock = AsyncMock()
    assert await service.send_exam_revision(
        "998877", summary.id, journal.id, test_student.id, 10, "v1:new", date.today(), successful
    )
    assert log.attempts == 1
    assert log.revision == 2
    assert not await service.finalize_notification(stale, None)
    assert log.revision_fingerprint == "v1:new"


@pytest.mark.asyncio
async def test_recovery_routes_real_journal_and_rejects_changed_document(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
    from app.services.notification_service import NotificationService

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    await ExamFixture.document(db_session, test_student, journal, "before.pdf")
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    sender.side_effect = RuntimeError("synthetic")
    from arq import Retry

    with pytest.raises(Retry):
        await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    queued: list[dict[str, Any]] = []

    async def enqueue(name: str, payload: dict[str, Any]) -> None:
        assert name == "send_exam_result_notification_task"
        queued.append(payload)

    service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db_session))
    assert await service.recover_deliveries(enqueue) == 1
    assert queued[0]["journal_id"] == journal.id
    await ExamFixture.document(db_session, test_student, journal, "after.pdf")
    payload: dict[str, Any] = {key: value for key, value in queued[0].items() if key != "_job_id"}
    sender.reset_mock()
    sender.side_effect = None
    await tasks.send_exam_result_notification_task({}, **payload)
    assert sender.await_count == 0
    log: NotificationLog = (await db_session.execute(select(NotificationLog))).scalar_one()
    await db_session.refresh(log)
    assert log.error_message == "source_changed"
    assert log.is_terminal is True
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_args.args[1] == "after.pdf"


@pytest.mark.asyncio
async def test_changed_document_during_live_send_advances_revision_and_fences_old_owner(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    await ExamFixture.document(db_session, test_student, journal, "held.pdf")
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()

    async def transport(chat_id: int, document: str, **kwargs: Any) -> None:
        if document == "held.pdf":
            entered.set()
            await release.wait()

    sender.side_effect = transport
    old: asyncio.Task[None] = asyncio.create_task(
        tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    )
    await asyncio.wait_for(entered.wait(), 5)
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 1
    await ExamFixture.document(db_session, test_student, journal, "replacement.pdf")
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    release.set()
    await old
    async with TestingSessionLocal() as session:
        log: NotificationLog = (await session.execute(select(NotificationLog))).scalar_one()
        assert log.revision == 2
        assert log.status == "sent"
        assert log.attempts == 1
        assert log.claim_token is None
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert [call.args[1] for call in sender.await_args_list] == ["held.pdf", "replacement.pdf"]
