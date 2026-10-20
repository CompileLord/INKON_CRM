from datetime import date, datetime
from typing import Any
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.notification_log import NotificationLog
from app.models.user import User, UserRole
from app.tests.integration.wp30_delivery_support import DeliveryFixture
from app.tests.integration.test_remediation_wp31 import ExamFixture
from app.workers import tasks


@pytest.mark.asyncio
async def test_migration_ambiguous_siblings_baseline_utf8_equivalence_and_repeat_upgrade(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import importlib.util
    from pathlib import Path
    from types import ModuleType
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    from sqlalchemy.engine import Connection
    from app.models.notification_log import ExamNotificationBaseline, NotificationType
    from app.services.notification_service import ExamNotificationFingerprint

    journal: Journal = await DeliveryFixture.legacy_source(db_session, test_student, test_mentor)
    journal.period_label = "Ҳафта ✓"
    await db_session.execute(
        text("UPDATE courses SET title=:title WHERE id=:id"), {"title": "Курс 📚", "id": journal.course_id}
    )
    await db_session.commit()
    sibling: User = User(
        email="ambiguous@example.invalid",
        password_hash="synthetic",
        first_name="Sibling",
        last_name="Synthetic",
        role=UserRole.STUDENT,
        parent_telegram_chat_id=998877,
    )
    db_session.add(sibling)
    await db_session.flush()
    db_session.add(
        JournalStudentSummary(student_id=sibling.id, journal_id=journal.id, sum_score=10, max_period_score=100)
    )
    await db_session.commit()
    document: Document = await ExamFixture.document(db_session, test_student, journal, "ҳуҷҷат📄.pdf")
    legacy: NotificationLog = NotificationLog(
        recipient="998877",
        type=NotificationType.EXAM_RESULT,
        related_entity_id=journal.id,
        notification_date=date(2026, 10, 19),
        status="sent",
        attempts=2,
        user_id=None,
        error_message="score:10",
    )
    db_session.add(legacy)
    await db_session.commit()
    spec: Any = importlib.util.spec_from_file_location(
        "wp31_migration", Path("alembic/versions/rwp31_exam_revision.py")
    )
    assert spec is not None and spec.loader is not None
    migration: ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def migrate(connection: Connection) -> None:
        connection.execute(text("DROP TABLE exam_notification_baselines"))
        connection.execute(
            text("ALTER TABLE notification_logs DROP COLUMN revision_fingerprint, DROP COLUMN source_journal_id")
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            migration.downgrade()
            migration.upgrade()

    connection: Any = await db_session.connection()
    await connection.run_sync(migrate)
    await db_session.commit()
    observed: list[ExamNotificationBaseline] = list(
        (await db_session.execute(select(ExamNotificationBaseline))).scalars()
    )
    assert len(observed) == 2
    summary: JournalStudentSummary = (
        await db_session.execute(
            select(JournalStudentSummary).where(JournalStudentSummary.student_id == test_student.id)
        )
    ).scalar_one()
    title: str = (
        await db_session.execute(text("SELECT title FROM courses WHERE id=:id"), {"id": journal.course_id})
    ).scalar_one()
    expected: str = ExamNotificationFingerprint.build(
        (
            summary.version,
            summary.sum_score,
            summary.max_period_score,
            summary.attendance_count,
            summary.total_lessons,
            journal.period_label,
            title,
            document.id,
            document.file_path,
        )
    )
    own_baseline: ExamNotificationBaseline = next(row for row in observed if row.summary_id == summary.id)
    assert own_baseline.observed_fingerprint == expected
    timestamp: datetime | None = own_baseline.observed_at
    sender: AsyncMock = ExamFixture.sender(monkeypatch)
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    await tasks.send_exam_result_notification_task({}, sibling.id, journal.id)
    assert sender.await_count == 0
    assert len(list((await db_session.execute(select(NotificationLog))).scalars())) == 1
    await db_session.refresh(legacy)
    assert (legacy.user_id, legacy.status, legacy.attempts, legacy.error_message, legacy.related_entity_id) == (
        None,
        "sent",
        2,
        "score:10",
        journal.id,
    )
    replacement: Document = await ExamFixture.document(db_session, test_student, journal, "new.pdf")
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 1

    def upgrade_again(connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            migration.upgrade()

    connection = await db_session.connection()
    await connection.run_sync(upgrade_again)
    await db_session.commit()
    await db_session.refresh(own_baseline)
    assert own_baseline.observed_fingerprint == expected
    assert own_baseline.observed_at == timestamp
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 1
    await ExamFixture.document(db_session, sibling, journal, "sibling-new.pdf")
    await tasks.send_exam_result_notification_task({}, sibling.id, journal.id)
    assert sender.await_count == 2
    replacement.is_deleted = True
    await db_session.commit()
    await tasks.send_exam_result_notification_task({}, test_student.id, journal.id)
    assert sender.await_count == 3
    assert sender.await_args.args[1] == "ҳуҷҷат📄.pdf"
