from __future__ import annotations

import os
import subprocess
import uuid
from typing import Any

import asyncpg
import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.db.base import Base
import app.models
from app.models.org_settings import OrgSettings


class DisposableMigrationDatabase:
    permitted_hosts: frozenset[str] = frozenset({"localhost", "127.0.0.1", "::1"})
    test_database_name: str = "imkon_test_db"
    pre_scoring_revision: str = "b7c1d2e3f4a5"

    def __init__(self, backend_root: str) -> None:
        self.backend_root: str = backend_root
        database_url: str | None = os.environ.get("TEST_DATABASE_URL")
        if not database_url:
            raise RuntimeError("Migration tests require TEST_DATABASE_URL")
        if os.environ.get("TESTING", "").lower() != "true" or os.environ.get("ENVIRONMENT") != "testing":
            raise RuntimeError("Migration tests require explicit testing settings")
        self.test_url: URL = make_url(database_url)
        if (
            self.test_url.drivername != "postgresql+asyncpg"
            or self.test_url.host not in self.permitted_hosts
            or self.test_url.port != 5432
            or self.test_url.database != self.test_database_name
            or self.test_url.query
            or "#" in database_url
        ):
            raise RuntimeError("Migration tests require the dedicated loopback test database")
        migration_script: ScriptDirectory = ScriptDirectory.from_config(
            Config(os.path.join(self.backend_root, "alembic.ini"))
        )
        migration_heads: list[str] = migration_script.get_heads()
        if len(migration_heads) != 1:
            raise AssertionError(f"Expected one Alembic head, found {len(migration_heads)}")
        self.head_revision: str = migration_heads[0]
        self.database_name: str = f"wp42_migration_{uuid.uuid4().hex}"
        self.database_url: URL = self.test_url.set(database=self.database_name)
        self.created: bool = False

    async def __aenter__(self) -> DisposableMigrationDatabase:
        connection = await asyncpg.connect(**self._connection_parameters(self.test_url, "postgres"))
        try:
            await connection.execute(f'CREATE DATABASE "{self.database_name}"')
        finally:
            await connection.close()
        self.created = True
        return self

    async def __aexit__(self, exception_type: Any, exception_value: Any, traceback: Any) -> None:
        if not self.created:
            return
        connection = await asyncpg.connect(**self._connection_parameters(self.test_url, "postgres"))
        try:
            await connection.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
                self.database_name,
            )
            await connection.execute(f'DROP DATABASE "{self.database_name}"')
        finally:
            await connection.close()

    def upgrade(self, revision: str) -> subprocess.CompletedProcess[str]:
        return self.run_alembic("upgrade", revision)

    def run_alembic(self, direction: str, revision: str) -> subprocess.CompletedProcess[str]:
        command_environment: dict[str, str] = os.environ.copy()
        command_environment["DATABASE_URL"] = self.database_url.render_as_string(hide_password=False)
        return subprocess.run(
            ["alembic", direction, revision],
            cwd=self.backend_root,
            env=command_environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    async def fetchrow(self, query: str, *parameters: Any) -> asyncpg.Record | None:
        connection = await asyncpg.connect(**self._connection_parameters(self.database_url))
        try:
            return await connection.fetchrow(query, *parameters)
        finally:
            await connection.close()

    async def fetchval(self, query: str, *parameters: Any) -> Any:
        connection = await asyncpg.connect(**self._connection_parameters(self.database_url))
        try:
            return await connection.fetchval(query, *parameters)
        finally:
            await connection.close()

    async def execute(self, query: str, *parameters: Any) -> str:
        connection = await asyncpg.connect(**self._connection_parameters(self.database_url))
        try:
            return await connection.execute(query, *parameters)
        finally:
            await connection.close()

    async def check_constraint_rejects(self, query: str, *parameters: Any) -> bool:
        connection = await asyncpg.connect(**self._connection_parameters(self.database_url))
        try:
            try:
                async with connection.transaction():
                    await connection.execute(query, *parameters)
            except asyncpg.CheckViolationError:
                return True
            return False
        finally:
            await connection.close()

    async def compare_models(self) -> list[Any]:
        engine = create_async_engine(self.database_url)
        try:
            async with engine.connect() as connection:
                return await connection.run_sync(
                    lambda sync_connection: compare_metadata(
                        MigrationContext.configure(sync_connection),
                        Base.metadata,
                    )
                )
        finally:
            await engine.dispose()

    @staticmethod
    def _connection_parameters(url: URL, database_name: str | None = None) -> dict[str, Any]:
        return {
            "host": url.host,
            "port": url.port,
            "user": url.username,
            "password": url.password,
            "database": database_name or url.database,
        }


class MigrationFixtureWriter:
    def __init__(self, database: DisposableMigrationDatabase) -> None:
        self.database: DisposableMigrationDatabase = database

    async def create_scoring_fixture(self, *, invalid_bonus_score: int | None = None) -> int:
        mentor_id: int = await self.database.fetchval(
            "INSERT INTO users (email, first_name, last_name, role) "
            "VALUES ('wp42-mentor@example.invalid', 'Synthetic', 'Mentor', 'mentor') RETURNING id"
        )
        student_id: int = await self.database.fetchval(
            "INSERT INTO users (email, first_name, last_name, role) "
            "VALUES ('wp42-student@example.invalid', 'Synthetic', 'Student', 'student') RETURNING id"
        )
        course_id: int = await self.database.fetchval(
            "INSERT INTO courses "
            "(title, description, start_date, end_date, exam_type, price, mentor_id) "
            "VALUES ('Synthetic scoring course', '', DATE '2026-01-01', DATE '2026-12-31', 'monthly', 10, $1) RETURNING id",
            mentor_id,
        )
        journal_id: int = await self.database.fetchval(
            "INSERT INTO journals (course_id, period_label, period_start, period_end, period_type) "
            "VALUES ($1, 'Synthetic month', DATE '2026-01-01', DATE '2026-01-31', 'month') RETURNING id",
            course_id,
        )
        bonus_score: int = invalid_bonus_score if invalid_bonus_score is not None else 25
        summary_id: int = await self.database.fetchval(
            "INSERT INTO journal_student_summaries "
            "(journal_id, student_id, exam_score, bonus_score, sum_score, attendance_count, total_lessons) "
            "VALUES ($1, $2, 80, $3, 110, 6, 10) RETURNING id",
            journal_id,
            student_id,
            bonus_score,
        )
        return summary_id


@pytest.mark.asyncio
async def test_empty_database_migrates_to_head_with_model_equivalent_schema() -> None:
    backend_root: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    async with DisposableMigrationDatabase(backend_root) as database:
        upgrade_result: subprocess.CompletedProcess[str] = database.upgrade("head")

        assert upgrade_result.returncode == 0, upgrade_result.stdout + upgrade_result.stderr
        assert await database.fetchval("SELECT version_num FROM alembic_version") == database.head_revision
        assert OrgSettings.__table__.name == "org_settings"
        assert app.models.User.__table__.name == "users"
        assert await database.compare_models() == []


@pytest.mark.asyncio
async def test_pre_scoring_revision_upgrade_preserves_derived_scores_and_constraints() -> None:
    backend_root: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    async with DisposableMigrationDatabase(backend_root) as database:
        prior_upgrade: subprocess.CompletedProcess[str] = database.upgrade(database.pre_scoring_revision)
        assert prior_upgrade.returncode == 0, prior_upgrade.stdout + prior_upgrade.stderr
        summary_id: int = await MigrationFixtureWriter(database).create_scoring_fixture()

        head_upgrade: subprocess.CompletedProcess[str] = database.upgrade("head")

        assert head_upgrade.returncode == 0, head_upgrade.stdout + head_upgrade.stderr
        migrated_summary: asyncpg.Record | None = await database.fetchrow(
            "SELECT homework_score, attendance_score, exam_score, bonus_score, sum_score, max_period_score "
            "FROM journal_student_summaries WHERE id = $1",
            summary_id,
        )
        assert migrated_summary is not None
        assert dict(migrated_summary) == {
            "homework_score": 5,
            "attendance_score": 6,
            "exam_score": 60,
            "bonus_score": 20,
            "sum_score": 91,
            "max_period_score": 140,
        }
        assert await database.fetchval("SELECT exam_max_score FROM journals") == 60
        assert await database.fetchval("SELECT version_num FROM alembic_version") == database.head_revision
        assert await database.compare_models() == []
        constraint_names: set[str] = set(
            await database.fetchval(
                "SELECT array_agg(conname ORDER BY conname) FROM pg_constraint "
                "WHERE conname IN ('check_exam_max_score_range', 'check_bonus_score_range')"
            )
        )
        assert constraint_names == {"check_bonus_score_range", "check_exam_max_score_range"}

        assert await database.check_constraint_rejects(
            "UPDATE journal_student_summaries SET bonus_score = 101 WHERE id = $1",
            summary_id,
        )
        assert await database.check_constraint_rejects("UPDATE journals SET bonus_max_score = 101")
        assert await database.check_constraint_rejects("UPDATE journals SET exam_max_score = 101")


@pytest.mark.asyncio
async def test_scoring_migration_failure_rolls_back_and_can_be_recovered() -> None:
    backend_root: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    async with DisposableMigrationDatabase(backend_root) as database:
        prior_upgrade: subprocess.CompletedProcess[str] = database.upgrade(database.pre_scoring_revision)
        assert prior_upgrade.returncode == 0, prior_upgrade.stdout + prior_upgrade.stderr
        summary_id: int = await MigrationFixtureWriter(database).create_scoring_fixture(invalid_bonus_score=-1)

        failed_upgrade: subprocess.CompletedProcess[str] = database.upgrade("head")

        assert failed_upgrade.returncode != 0
        assert await database.fetchval("SELECT version_num FROM alembic_version") == database.pre_scoring_revision
        prior_summary: asyncpg.Record | None = await database.fetchrow(
            "SELECT exam_score, bonus_score, sum_score, attendance_count FROM journal_student_summaries WHERE id = $1",
            summary_id,
        )
        assert prior_summary is not None
        assert dict(prior_summary) == {
            "exam_score": 80,
            "bonus_score": -1,
            "sum_score": 110,
            "attendance_count": 6,
        }
        assert await database.fetchval(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = 'journal_student_summaries' AND column_name = 'homework_score'"
        ) == 0

        await database.execute(
            "UPDATE journal_student_summaries SET bonus_score = 0, sum_score = 86 WHERE id = $1",
            summary_id,
        )
        recovered_upgrade: subprocess.CompletedProcess[str] = database.upgrade("head")

        assert recovered_upgrade.returncode == 0, recovered_upgrade.stdout + recovered_upgrade.stderr
        recovered_summary: asyncpg.Record | None = await database.fetchrow(
            "SELECT homework_score, attendance_score, exam_score, bonus_score, sum_score, max_period_score "
            "FROM journal_student_summaries WHERE id = $1",
            summary_id,
        )
        assert recovered_summary is not None
        assert dict(recovered_summary) == {
            "homework_score": 6,
            "attendance_score": 6,
            "exam_score": 60,
            "bonus_score": 0,
            "sum_score": 72,
            "max_period_score": 140,
        }


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql+asyncpg://synthetic:synthetic@database.example:5432/imkon_test_db",
        "postgresql+asyncpg://synthetic:synthetic@localhost:5432/imkon_production",
        "postgresql+asyncpg://synthetic:synthetic@localhost:5432/imkon_test_db?host=database.example",
        "postgresql+asyncpg://synthetic:synthetic@localhost:5432/imkon_test_db#production",
    ],
    ids=["remote-host", "wrong-database", "driver-host-override", "fragment-override"],
)
def test_migration_database_rejects_non_disposable_targets_before_connecting(
    monkeypatch: pytest.MonkeyPatch,
    database_url: str,
) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", database_url)
    monkeypatch.setenv("TESTING", "true")
    monkeypatch.setenv("ENVIRONMENT", "testing")

    with pytest.raises(RuntimeError, match="dedicated loopback test database"):
        DisposableMigrationDatabase("/tmp/unused-migration-root")


@pytest.mark.asyncio
async def test_bonus_maximum_migration_recomputes_stored_period_maximum_without_clipping_bonuses() -> None:
    backend_root: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    async with DisposableMigrationDatabase(backend_root) as database:
        prior_upgrade: subprocess.CompletedProcess[str] = database.upgrade("be2a1b2c3d4e")
        assert prior_upgrade.returncode == 0, prior_upgrade.stdout + prior_upgrade.stderr
        summary_id: int = await MigrationFixtureWriter(database).create_scoring_fixture(invalid_bonus_score=20)
        await database.execute("UPDATE journal_student_summaries SET max_period_score = 120 WHERE id = $1", summary_id)

        head_upgrade: subprocess.CompletedProcess[str] = database.upgrade("head")

        assert head_upgrade.returncode == 0, head_upgrade.stdout + head_upgrade.stderr
        assert await database.fetchval("SELECT bonus_max_score FROM journals") == 20
        migrated_maximum: int = await database.fetchval(
            "SELECT max_period_score FROM journal_student_summaries WHERE id = $1", summary_id
        )
        assert migrated_maximum == 10 * 6 + 70 + 20
        assert await database.fetchval(
            "SELECT bonus_score FROM journal_student_summaries WHERE id = $1", summary_id
        ) == 20
        assert await database.compare_models() == []

        downgrade: subprocess.CompletedProcess[str] = database.run_alembic("downgrade", "be2a1b2c3d4e")
        assert downgrade.returncode == 0, downgrade.stdout + downgrade.stderr
        assert await database.fetchval(
            "SELECT max_period_score FROM journal_student_summaries WHERE id = $1", summary_id
        ) == 10 * 6 + 70
