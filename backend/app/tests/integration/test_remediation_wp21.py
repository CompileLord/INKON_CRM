import asyncio
from datetime import date, time, timedelta
from contextvars import ContextVar
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from typing import Any
from starlette.types import Scope, Receive, Send, Message

import pytest
from httpx import AsyncClient, ASGITransport, Response
from fastapi import FastAPI, HTTPException
from app.api.v1.journals import router
from app.core.deps import get_db_session, get_current_user
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.schemas.journal import JournalEntryUpdate
from app.services.audit_service import AuditService
from app.services.sum_calculation_service import SumCalculationService
from app.services.journal_service import JournalService
from app.api.v1.journals import batch_update_entries
from app.tests.conftest import TestingSessionLocal


async def create_journal(client: AsyncClient, admin: User, mentor: User, student: User) -> tuple[int, list[JournalEntryUpdate]]:
    session: AsyncSession
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(admin.id, admin.role)}"}
    course: Response = await client.post("/api/v1/courses/", headers=headers, json={
        "title": "Autosave transaction race", "description": "Concurrency regression",
        "start_date": "2026-08-01", "end_date": "2026-08-31", "exam_type": "weekly",
        "price": "300.00", "mentor_id": mentor.id,
        "schedules": [{"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"},
                      {"day_of_week": 2, "time_start": "18:00:00", "time_end": "20:00:00"}],
    })
    assert course.status_code == 201, course.text
    enrollment: Response = await client.post("/api/v1/enrollments/", headers=headers, json={
        "student_id": student.id, "course_id": course.json()["id"]
    })
    assert enrollment.status_code == 201, enrollment.text
    async with TestingSessionLocal() as session:
        journal: Journal | None = (await session.scalars(select(Journal).where(Journal.course_id == course.json()["id"]).order_by(Journal.id))).first()
        entries: Sequence[JournalEntry] = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal.id).order_by(JournalEntry.lesson_date))).all()
        assert len(entries) >= 2
        return journal.id, [JournalEntryUpdate(student_id=entry.student_id, lesson_date=entry.lesson_date,
                    attendance=True, score=3, comment="simultaneous", version=entry.version) for entry in entries[:2]]


@pytest.mark.asyncio
@pytest.mark.parametrize("same_entry", [True, False])
@pytest.mark.parametrize("audit_flush", [True, False])
async def test_independent_autosaves_conflict_at_entry_or_shared_summary(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    monkeypatch: pytest.MonkeyPatch, same_entry: bool, audit_flush: bool,
) -> None:
    session: AsyncSession
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    original_log: Callable[..., Awaitable[None]] = AuditService.log
    both_ready: asyncio.Event = asyncio.Event()
    proceed: asyncio.Event = asyncio.Event()
    arrivals: int = 0

    async def synchronized_log(self: AuditService, *args: Any, **kwargs: Any) -> None:
        nonlocal arrivals
        arrivals += 1
        if arrivals == 2:
            both_ready.set()
        await asyncio.wait_for(proceed.wait(), timeout=10)
        await original_log(self, *args, **kwargs)
        if audit_flush:
            await self.db.flush()

    monkeypatch.setattr(AuditService, "log", synchronized_log)

    application: FastAPI = FastAPI()
    application.include_router(router, prefix="/api/v1/journals")
    active_session: ContextVar[AsyncSession] = ContextVar("wp21_race_session")

    async def independent_session() -> AsyncIterator[AsyncSession]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            active_session.set(session)
            retained_summaries: Sequence[JournalStudentSummary] = (await session.scalars(select(JournalStudentSummary).where(
                JournalStudentSummary.journal_id == journal_id,
            ))).all()
            assert retained_summaries
            yield session

    application.dependency_overrides[get_db_session] = independent_session
    application.dependency_overrides[get_current_user] = lambda: test_admin

    async def observed_application(scope: Scope, receive: Receive, send: Send) -> None:
        async def observe_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                assert not active_session.get().in_transaction()
            await send(message)
        await application(scope, receive, observe_send)

    async def save(update: JournalEntryUpdate) -> tuple[int, dict[str, object]]:
        request_client: AsyncClient
        async with AsyncClient(transport=ASGITransport(app=observed_application), base_url="http://test") as request_client:
            response: Response = await request_client.put(f"/api/v1/journals/{journal_id}/entries", json=[update.model_dump(mode="json")])
            return response.status_code, response.json()

    left: asyncio.Task[tuple[int, dict[str, object]]] = asyncio.create_task(save(updates[0]))
    right: asyncio.Task[tuple[int, dict[str, object]]] = asyncio.create_task(save(updates[0] if same_entry else updates[1]))
    try:
        await asyncio.wait_for(both_ready.wait(), timeout=10)
    finally:
        proceed.set()
    outcomes: list[tuple[int, dict[str, object]]] = await asyncio.wait_for(asyncio.gather(left, right), timeout=20)
    assert sorted(status for status, _ in outcomes) == [200, 409]
    winner: dict[str, object] = next(result for status, result in outcomes if status == 200)
    assert winner["applied"][0]["version"] == updates[0].version + 1
    async with TestingSessionLocal() as session:
        audit_count: int | None = await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry"))
        assert audit_count == 4
        persisted: Sequence[JournalEntry] = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal_id))).all()
        assert sum(entry.score == 3 for entry in persisted) == 1

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry", AuditLog.field_name == "is_graded", AuditLog.new_value == "True")) == 1



@pytest.mark.asyncio
async def test_audit_staging_and_noop_do_not_flush_per_cell(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    session: AsyncSession
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        flushes: int = 0
        original_flush: Callable[..., Awaitable[None]] = session.flush

        async def count_flush(*args: Any, **kwargs: Any) -> None:
            nonlocal flushes
            flushes += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_flush
        result: dict[str, object] = await JournalService(session).batch_update_entries(journal_id, updates, test_admin)
        await session.commit()
        assert flushes <= 3
        assert len(result["applied"]) == 2
    async with TestingSessionLocal() as session:
        flushes = 0
        original_flush = session.flush

        async def count_noop_flush(*args: Any, **kwargs: Any) -> None:
            nonlocal flushes
            flushes += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_noop_flush
        await JournalService(session).batch_update_entries(journal_id, updates, test_admin)
        assert flushes <= 1
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 8

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry", AuditLog.field_name == "is_graded", AuditLog.new_value == "True")) == 2



@pytest.mark.asyncio
async def test_commit_conflict_rolls_back_staged_audits(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    session: AsyncSession
    conflict: pytest.ExceptionInfo[HTTPException]
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        second_entry: JournalEntry | None = await session.scalar(select(JournalEntry).where(
            JournalEntry.journal_id == journal_id,
            JournalEntry.lesson_date == updates[1].lesson_date,
        ))
        original_commit: Callable[[], Awaitable[None]] = session.commit

        async def reject_commit() -> None:
            concurrent_session: AsyncSession
            async with TestingSessionLocal() as concurrent_session:
                concurrent_entry: JournalEntry | None = await concurrent_session.get(JournalEntry, second_entry.id)
                concurrent_entry.comment = "concurrent commit winner"
                await concurrent_session.commit()
            second_entry.comment = "commit loser"
            await original_commit()

        session.commit = reject_commit
        with pytest.raises(HTTPException) as conflict:
            await batch_update_entries(journal_id, [updates[0]], test_admin, session)
        assert conflict.value.status_code == 409
        assert not session.in_transaction()

    async with TestingSessionLocal() as session:
        entries: Sequence[JournalEntry] = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal_id))).all()
        assert all(entry.score == 0 for entry in entries)
        assert next(entry for entry in entries if entry.lesson_date == updates[1].lesson_date).comment == "concurrent commit winner"
        assert next(entry for entry in entries if entry.lesson_date == updates[0].lesson_date).version == 1
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("cell_count", [1, 10, 100])
async def test_autosave_flush_invocations_are_batch_bounded(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    cell_count: int,
) -> None:
    session: AsyncSession
    journal_id: int
    _: list[JournalEntryUpdate]
    journal_id, _ = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        journal: Journal = await session.get(Journal, journal_id)
        journal.period_start = date(2026, 1, 1)
        journal.period_end = date(2026, 10, 1)
        session.add_all([
            CourseSchedule(course_id=journal.course_id, day_of_week=weekday, time_start=time(18), time_end=time(20))
            for weekday in (1, 3, 4, 5, 6)
        ])
        session.add_all([
            JournalEntry(
                journal_id=journal_id,
                student_id=test_student.id,
                lesson_date=date(2026, 1, 1) + timedelta(days=index),
                attendance=False,
                score=0,
                version=1,
            )
            for index in range(cell_count)
        ])
        await session.commit()

    updates: list[JournalEntryUpdate] = [
        JournalEntryUpdate(
            student_id=test_student.id,
            lesson_date=date(2026, 1, 1) + timedelta(days=index),
            attendance=True,
            score=3,
            comment="batch",
            version=1,
        )
        for index in range(cell_count)
    ]
    async with TestingSessionLocal() as session:
        flush_count: int = 0
        original_flush: Callable[..., Awaitable[None]] = session.flush

        async def count_flush(*args: Any, **kwargs: Any) -> None:
            nonlocal flush_count
            flush_count += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_flush
        response: dict[str, object] = await batch_update_entries(journal_id, updates, test_admin, session)
        assert len(response["applied"]) == cell_count
        assert flush_count == 2

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 4 * cell_count

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry", AuditLog.field_name == "is_graded", AuditLog.new_value == "True")) == cell_count
