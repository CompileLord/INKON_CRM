from datetime import date
from importlib.machinery import ModuleSpec
import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import select, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession
from app.models.audit_log import AuditLog
from app.models.course import Course
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.tests.integration.test_remediation_wp33 import GradingFixture


@pytest.mark.asyncio
async def test_audit_only_backfill_preserves_unknown_positive_scores_and_false_flag_audits(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    course: Course
    current: Journal
    future: Journal
    course, current, future = await GradingFixture.create(db_session, test_student, test_mentor, test_admin)
    entries: list[JournalEntry] = await GradingFixture.entries(db_session, current)
    entries[0].score = 0
    entries[1].score = 5
    summaries: list[JournalStudentSummary] = list(
        (await db_session.execute(select(JournalStudentSummary).order_by(JournalStudentSummary.id))).scalars()
    )
    summary: JournalStudentSummary
    for summary in summaries:
        summary.sum_score = 100
        summary.max_period_score = 100
        summary.version = 50
    db_session.add_all(
        [
            AuditLog(
                user_id=test_mentor.id,
                action="update",
                entity_type="journal_entry",
                entity_id=entries[0].id,
                field_name="attendance",
                old_value="True",
                new_value="False",
            ),
            AuditLog(
                user_id=test_mentor.id,
                action="update",
                entity_type="journal_entry",
                entity_id=entries[1].id,
                field_name="is_graded",
                old_value=None,
                new_value="False",
            ),
            AuditLog(
                user_id=test_mentor.id,
                action="update",
                entity_type="journal_student_summary",
                entity_id=summaries[1].id,
                field_name="is_graded",
                old_value=None,
                new_value="False",
            ),
        ]
    )
    await db_session.commit()
    spec: ModuleSpec | None = importlib.util.spec_from_file_location(
        "wp33_migration", Path("alembic/versions/rwp33_grading_state.py")
    )
    assert spec is not None and spec.loader is not None
    migration: ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def upgrade(connection: Connection) -> None:
        connection.execute(text("ALTER TABLE journal_entries DROP COLUMN is_graded"))
        connection.execute(text("ALTER TABLE journal_student_summaries DROP COLUMN is_graded"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.downgrade()
            migration.upgrade()

    connection: AsyncConnection = await db_session.connection()
    await connection.run_sync(upgrade)
    await db_session.commit()
    for entry in entries:
        await db_session.refresh(entry)
    for summary in summaries:
        await db_session.refresh(summary)
    assert entries[0].is_graded is True
    assert entries[1].is_graded is None
    assert summaries[0].is_graded is True
    assert summaries[1].is_graded is None
    assert [(row.sum_score, row.max_period_score, row.version) for row in summaries] == [(100, 100, 50), (100, 100, 50)]
    future_entries: list[JournalEntry] = await GradingFixture.entries(db_session, future)
    assert all(row.is_graded is None for row in future_entries)
    old_insert: Any = await db_session.execute(
        text(
            "INSERT INTO journal_entries (journal_id,student_id,lesson_date,attendance,score,version) VALUES (:journal,:student,:day,false,0,1) RETURNING is_graded"
        ),
        {"journal": current.id, "student": test_student.id, "day": date.today()},
    )
    assert old_insert.scalar_one() is None
    db_session.add(
        AuditLog(
            user_id=test_mentor.id,
            action="update",
            entity_type="journal_student_summary",
            entity_id=summaries[1].id,
            field_name="is_graded",
            old_value="False",
            new_value="True",
        )
    )
    await db_session.commit()

    def reupgrade(connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            migration.upgrade()

    connection = await db_session.connection()
    await connection.run_sync(reupgrade)
    await db_session.commit()
    await db_session.refresh(summaries[1])
    assert summaries[1].is_graded is True
