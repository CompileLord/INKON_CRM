import asyncio
from datetime import date, timedelta
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


from app.tests.integration.test_remediation_wp21 import create_journal


@pytest.mark.asyncio
async def test_partial_conflicts_replay_versions_and_exact_audit_changes(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    session: AsyncSession
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        second_entry: JournalEntry | None = await session.scalar(select(JournalEntry).where(
            JournalEntry.journal_id == journal_id,
            JournalEntry.lesson_date == updates[1].lesson_date,
        ))
        second_entry.comment = "other editor"
        await session.commit()
        second_version: int = second_entry.version
    missing: JournalEntryUpdate = updates[0].model_copy(update={"lesson_date": date(2040, 1, 1)})
    async with TestingSessionLocal() as session:
        response: dict[str, object] = await batch_update_entries(journal_id, [*updates, missing], test_admin, session)
        assert response["applied"] == [{
            "student_id": test_student.id, "lesson_date": updates[0].lesson_date,
            "attendance": True, "score": 3, "comment": "simultaneous", "version": 2,
        }]
        assert len(response["conflicts"]) == 2
        assert response["conflicts"][0]["submitted_version"] == 1
        assert response["conflicts"][0]["current"]["version"] == second_version
        assert response["conflicts"][0]["current"]["comment"] == "other editor"
        assert response["conflicts"][1]["current"] is None
    async with TestingSessionLocal() as session:
        audit_rows: Sequence[AuditLog] = (await session.scalars(select(AuditLog).where(AuditLog.entity_type == "journal_entry"))).all()
        assert {(row.field_name, row.old_value, row.new_value) for row in audit_rows} == {
            ("is_graded", "False", "True"), ("attendance", "False", "True"), ("score", "0", "3"), ("comment", None, "simultaneous"),
        }
        assert len(audit_rows) == 4
        replay: dict[str, object] = await batch_update_entries(journal_id, [updates[0]], test_admin, session)
        assert replay["applied"][0]["version"] == 2
        assert replay["conflicts"] == []
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry")) == 4



@pytest.mark.asyncio
async def test_noop_and_changed_batch_recalculate_only_affected_students(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session: AsyncSession
    from app.services.sum_calculation_service import SumCalculationService
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        unrelated_student: User = User(
            email="unrelated-autosave@example.invalid", password_hash=test_student.password_hash,
            first_name="Unrelated", last_name="Student", role=test_student.role,
            must_set_password=False,
        )
        session.add(unrelated_student)
        await session.flush()
        unrelated_summary: JournalStudentSummary | None = JournalStudentSummary(
            journal_id=journal_id, student_id=unrelated_student.id, homework_score=777,
            sum_score=777, total_lessons=1, version=1,
        )
        session.add_all([unrelated_summary, JournalEntry(
            journal_id=journal_id, student_id=unrelated_student.id,
            lesson_date=updates[0].lesson_date, attendance=False, score=2, version=1,
        )])
        await session.commit()
        unrelated_summary_id: int = unrelated_summary.id
        unrelated_summary_version: int = unrelated_summary.version
    original_recalculate: Callable[[SumCalculationService, int, set[int] | None], Awaitable[None]] = SumCalculationService.recalculate_journal
    recalculated_students: list[set[int] | None] = []

    async def record_recalculation(self: SumCalculationService, journal_id: int, student_ids: set[int] | None = None) -> None:
        recalculated_students.append(student_ids)
        await original_recalculate(self, journal_id, student_ids)

    monkeypatch.setattr(SumCalculationService, "recalculate_journal", record_recalculation)
    async with TestingSessionLocal() as session:
        await batch_update_entries(journal_id, updates, test_admin, session)
        assert recalculated_students == [{test_student.id}]
    async with TestingSessionLocal() as session:
        await batch_update_entries(journal_id, updates, test_admin, session)
        assert recalculated_students == [{test_student.id}]
        unrelated_summary = await session.get(JournalStudentSummary, unrelated_summary_id)
        assert unrelated_summary.homework_score == 777
        assert unrelated_summary.sum_score == 777
        assert unrelated_summary.version == unrelated_summary_version


@pytest.mark.asyncio
async def test_command_commits_once_before_response_and_does_not_mask_database_errors(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session: AsyncSession
    request_client: AsyncClient
    import app.core.deps as dependencies
    from sqlalchemy.exc import IntegrityError
    from app.services.journal_service import JournalCommandTransaction

    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    async with TestingSessionLocal() as session:
        commits: int = 0
        original_commit: Callable[[], Awaitable[None]] = session.commit

        async def count_commit() -> None:
            nonlocal commits
            commits += 1
            await original_commit()

        session.commit = count_commit
        application: FastAPI = FastAPI()
        application.include_router(router, prefix="/api/v1/journals")
        application.dependency_overrides[get_current_user] = lambda: test_admin
        monkeypatch.setattr(dependencies, "AsyncSessionLocal", lambda: session)
        response_started: list[int] = []

        async def observed_application(scope: Scope, receive: Receive, send: Send) -> None:
            async def observe_send(message: Message) -> None:
                if message["type"] == "http.response.start":
                    response_started.append(commits)
                    assert not session.in_transaction()
                await send(message)
            await application(scope, receive, observe_send)

        async with AsyncClient(transport=ASGITransport(app=observed_application), base_url="http://test") as request_client:
            response: Response = await request_client.put(f"/api/v1/journals/{journal_id}/entries", json=[updates[0].model_dump(mode="json")])
        assert response.status_code == 200, response.text
        assert response_started == [1]
        assert commits == 1

    async with TestingSessionLocal() as session:
        with pytest.raises(IntegrityError):
            async with JournalCommandTransaction(session):
                raise IntegrityError("constraint failure", {}, RuntimeError("constraint failure"))
        assert not session.in_transaction()


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["summary", "exam-max-score"])
async def test_summary_write_routes_translate_real_stale_versions_and_rollback(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    command: str,
) -> None:
    request_client: AsyncClient
    session: AsyncSession
    journal_id: int
    _: list[JournalEntryUpdate]
    journal_id, _ = await create_journal(client, test_admin, test_mentor, test_student)
    application: FastAPI = FastAPI()
    application.include_router(router, prefix="/api/v1/journals")
    application.dependency_overrides[get_current_user] = lambda: test_admin

    async def stale_summary_session() -> AsyncIterator[AsyncSession]:
        session: AsyncSession
        concurrent_session: AsyncSession
        async with TestingSessionLocal() as session:
            retained_summary: JournalStudentSummary | None = await session.scalar(select(JournalStudentSummary).where(
                JournalStudentSummary.journal_id == journal_id,
                JournalStudentSummary.student_id == test_student.id,
            ))
            async with TestingSessionLocal() as concurrent_session:
                winner: JournalStudentSummary | None = await concurrent_session.get(JournalStudentSummary, retained_summary.id)
                winner.bonus_score = 1
                winner.sum_score += 1
                await concurrent_session.commit()
            yield session
            assert not session.in_transaction()

    application.dependency_overrides[get_db_session] = stale_summary_session
    path: str = (f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary"
            if command == "summary" else f"/api/v1/journals/{journal_id}/exam-max-score")
    payload: dict[str, int] = {"exam_score": 5, "bonus_score": 2, "version": 1} if command == "summary" else {"exam_max_score": 50}
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as request_client:
        response: Response = await request_client.patch(path, json=payload)
    assert response.status_code == 409, response.text
    async with TestingSessionLocal() as session:
        summary: JournalStudentSummary | None = await session.scalar(select(JournalStudentSummary).where(
            JournalStudentSummary.journal_id == journal_id,
            JournalStudentSummary.student_id == test_student.id,
        ))
        assert summary.exam_score == 0
        assert summary.bonus_score == 1
        assert summary.version == 2
        journal: Journal | None = await session.get(Journal, journal_id)
        assert journal.exam_max_score == 70
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type.in_(["journal", "journal_entry"]))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("second_version", [1, 2])
async def test_repeated_cell_changes_preserve_per_change_versions(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
    second_version: int,
) -> None:
    session: AsyncSession
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    second_update: JournalEntryUpdate = updates[0].model_copy(update={"score": 4, "version": second_version})
    async with TestingSessionLocal() as session:
        response: dict[str, object] = await batch_update_entries(journal_id, [updates[0], second_update], test_admin, session)
        if second_version == 1:
            assert len(response["applied"]) == 1
            assert response["applied"][0]["score"] == 3
            assert response["applied"][0]["version"] == 2
            assert response["conflicts"][0]["current"]["score"] == 3
            assert response["conflicts"][0]["current"]["version"] == 2
        else:
            assert len(response["applied"]) == 2
            assert all(entry["score"] == 4 and entry["version"] == 3 for entry in response["applied"])
            assert response["conflicts"] == []
    async with TestingSessionLocal() as session:
        audit_rows: Sequence[AuditLog] = (await session.scalars(select(AuditLog).where(AuditLog.entity_type == "journal_entry"))).all()
        assert len(audit_rows) == (4 if second_version == 1 else 5)
        assert any(row.field_name == "score" and row.old_value == "0" and row.new_value == "3" for row in audit_rows)
        assert sum(row.field_name == "score" and row.old_value == "3" and row.new_value == "4" for row in audit_rows) == (0 if second_version == 1 else 1)

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry", AuditLog.field_name == "is_graded", AuditLog.new_value == "True")) == 1



@pytest.mark.asyncio
async def test_repeated_sanitized_comment_preserves_audits_without_extra_version(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    session: AsyncSession
    journal_id: int
    updates: list[JournalEntryUpdate]
    journal_id, updates = await create_journal(client, test_admin, test_mentor, test_student)
    first_update: JournalEntryUpdate = updates[0].model_copy(update={"comment": "<b>sanitized</b>"})
    second_update: JournalEntryUpdate = first_update.model_copy(update={"version": 2})
    async with TestingSessionLocal() as session:
        response: dict[str, object] = await batch_update_entries(journal_id, [first_update, second_update], test_admin, session)
        assert response["conflicts"] == []
        assert len(response["applied"]) == 2
        assert all(entry["comment"] == "sanitized" and entry["version"] == 2 for entry in response["applied"])
    async with TestingSessionLocal() as session:
        audit_rows: Sequence[AuditLog] = (await session.scalars(select(AuditLog).where(AuditLog.entity_type == "journal_entry"))).all()
        assert len(audit_rows) == 5
        assert any(row.field_name == "comment" and row.old_value == "sanitized" and row.new_value == "<b>sanitized</b>" for row in audit_rows)

    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count(AuditLog.id)).where(AuditLog.entity_type == "journal_entry", AuditLog.field_name == "is_graded", AuditLog.new_value == "True")) == 1

