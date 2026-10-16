import asyncio
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.schemas.journal import JournalEntryUpdate
from app.services.audit_service import AuditService
from app.services.journal_service import JournalService
from app.api.v1.journals import batch_update_entries
from app.tests.conftest import TestingSessionLocal


async def create_journal(client: AsyncClient, admin: User, mentor: User, student: User) -> tuple[int, list[JournalEntryUpdate]]:
    headers = {"Authorization": f"Bearer {create_access_token(admin.id, admin.role)}"}
    course = await client.post("/api/v1/courses/", headers=headers, json={
        "title": "Autosave transaction race", "description": "Concurrency regression",
        "start_date": "2026-08-01", "end_date": "2026-08-31", "exam_type": "weekly",
        "price": "300.00", "mentor_id": mentor.id,
        "schedules": [{"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"},
                      {"day_of_week": 2, "time_start": "18:00:00", "time_end": "20:00:00"}],
    })
    assert course.status_code == 201, course.text
    enrollment = await client.post("/api/v1/enrollments/", headers=headers, json={
        "student_id": student.id, "course_id": course.json()["id"]
    })
    assert enrollment.status_code == 201, enrollment.text
    async with TestingSessionLocal() as session:
        journal = (await session.scalars(select(Journal).where(Journal.course_id == course.json()["id"]).order_by(Journal.id))).first()
        entries = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal.id).order_by(JournalEntry.lesson_date))).all()
        assert len(entries) >= 2
        return journal.id, [JournalEntryUpdate(student_id=entry.student_id, lesson_date=entry.lesson_date,
                    attendance=True, score=3, comment="simultaneous", version=entry.version) for entry in entries[:2]]


@pytest.mark.asyncio
@pytest.mark.parametrize("same_entry", [True, False])
async def test_independent_autosaves_conflict_at_entry_or_shared_summary(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    monkeypatch: pytest.MonkeyPatch, same_entry: bool,
) -> None:
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    original_log = AuditService.log
    both_ready = asyncio.Event()
    proceed = asyncio.Event()
    arrivals = 0

    async def synchronized_log(self: AuditService, *args, **kwargs) -> None:
        nonlocal arrivals
        arrivals += 1
        if arrivals == 2:
            both_ready.set()
        await asyncio.wait_for(proceed.wait(), timeout=10)
        await original_log(self, *args, **kwargs)

    monkeypatch.setattr(AuditService, "log", synchronized_log)

    async def save(update: JournalEntryUpdate) -> tuple[int, dict | None]:
        async with TestingSessionLocal() as session:
            (await session.scalars(select(JournalStudentSummary).where(
                JournalStudentSummary.journal_id == journal_id,
                JournalStudentSummary.student_id == update.student_id,
            ))).all()
            try:
                result = await batch_update_entries(journal_id, [update], test_admin, session)
                return 200, result
            except Exception as exc:
                from fastapi import HTTPException
                if isinstance(exc, HTTPException) and exc.status_code == 409:
                    await session.rollback()
                    return 409, None
                raise

    left = asyncio.create_task(save(updates[0]))
    right = asyncio.create_task(save(updates[0] if same_entry else updates[1]))
    try:
        await asyncio.wait_for(both_ready.wait(), timeout=10)
    finally:
        proceed.set()
    outcomes = await asyncio.wait_for(asyncio.gather(left, right), timeout=20)
    assert sorted(status for status, _ in outcomes) == [200, 409]
    winner = next(result for status, result in outcomes if status == 200)
    assert winner["applied"][0]["version"] == updates[0].version + 1
    async with TestingSessionLocal() as session:
        audit_count = await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry"))
        assert audit_count == 3
        persisted = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal_id))).all()
        assert sum(entry.score == 3 for entry in persisted) == 1


@pytest.mark.asyncio
async def test_audit_staging_and_noop_do_not_flush_per_cell(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        flushes = 0
        original_flush = session.flush

        async def count_flush(*args, **kwargs):
            nonlocal flushes
            flushes += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_flush
        result = await JournalService(session).batch_update_entries(journal_id, updates, test_admin)
        await session.commit()
        assert flushes <= 3
        assert len(result["applied"]) == 2
    async with TestingSessionLocal() as session:
        flushes = 0
        original_flush = session.flush

        async def count_noop_flush(*args, **kwargs):
            nonlocal flushes
            flushes += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_noop_flush
        await JournalService(session).batch_update_entries(journal_id, updates, test_admin)
        assert flushes <= 1
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 6


@pytest.mark.asyncio
async def test_commit_conflict_rolls_back_staged_audits(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        async def reject_commit() -> None:
            raise StaleDataError("concurrent version changed at commit")

        session.commit = reject_commit
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as conflict:
            await batch_update_entries(journal_id, [updates[0]], test_admin, session)
        assert conflict.value.status_code == 409
        assert not session.in_transaction()

    async with TestingSessionLocal() as session:
        entries = (await session.scalars(select(JournalEntry).where(JournalEntry.journal_id == journal_id))).all()
        assert all(entry.score == 0 and entry.version == 1 for entry in entries)
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("cell_count", [1, 10, 100])
async def test_autosave_flush_invocations_are_batch_bounded(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    cell_count: int,
) -> None:
    journal_id, _ = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        session.add_all([
            JournalEntry(
                journal_id=journal_id,
                student_id=test_student.id,
                lesson_date=date(2027, 1, 1) + timedelta(days=index),
                attendance=False,
                score=0,
                version=1,
            )
            for index in range(cell_count)
        ])
        await session.commit()

    updates = [
        JournalEntryUpdate(
            student_id=test_student.id,
            lesson_date=date(2027, 1, 1) + timedelta(days=index),
            attendance=True,
            score=3,
            comment="batch",
            version=1,
        )
        for index in range(cell_count)
    ]
    async with TestingSessionLocal() as session:
        flush_count = 0
        original_flush = session.flush

        async def count_flush(*args, **kwargs):
            nonlocal flush_count
            flush_count += 1
            return await original_flush(*args, **kwargs)

        session.flush = count_flush
        response = await batch_update_entries(journal_id, updates, test_admin, session)
        assert len(response["applied"]) == cell_count
        assert flush_count == 2

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 3 * cell_count
