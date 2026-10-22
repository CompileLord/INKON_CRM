import asyncio
import os
import subprocess
import sys
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy import Index

from app.models.user import User
from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase


class PlinkMigration:
    revision: str = "plink1_optional_email_phone"
    previous_revision: str = "rwp64_roster_index"
    index_name: str = "ux_users_phone_live"
    backend_root: str = str(Path(__file__).resolve().parents[3])

    @staticmethod
    def assert_command(result: subprocess.CompletedProcess[str]) -> None:
        assert result.returncode == 0, result.stdout + result.stderr

    @classmethod
    async def insert_user(cls, database: DisposableMigrationDatabase, email: str | None, phone: str | None, deleted: bool = False) -> None:
        await database.execute(
            "INSERT INTO users(email,first_name,last_name,role,phone,is_deleted) VALUES ($1,'F','L','student',$2,$3)",
            email, phone, deleted,
        )

    @classmethod
    async def email_is_nullable(cls, database: DisposableMigrationDatabase) -> bool:
        return await database.fetchval(
            "SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_name='users' AND column_name='email'"
        )

    @classmethod
    async def assert_valid_unique_index(cls, database: DisposableMigrationDatabase) -> None:
        row: asyncpg.Record | None = await database.fetchrow(
            "SELECT i.indisvalid, i.indisready, i.indisunique, pg_get_expr(i.indpred,i.indrelid) AS predicate "
            "FROM pg_index i WHERE i.indexrelid=to_regclass($1)", cls.index_name,
        )
        assert row is not None
        assert row["indisvalid"] and row["indisready"] and row["indisunique"]
        assert row["predicate"] == "((is_deleted = false) AND (phone IS NOT NULL))"


def test_model_metadata_declares_the_partial_unique_phone_index() -> None:
    indexes: list[Index] = [index for index in User.__table__.indexes if index.name == PlinkMigration.index_name]
    assert len(indexes) == 1
    assert [column.name for column in indexes[0].columns] == ["phone"]
    assert indexes[0].unique
    assert str(indexes[0].dialect_options["postgresql"]["where"]) == "is_deleted = false AND phone IS NOT NULL"
    assert User.__table__.c.email.nullable


@pytest.mark.parametrize(
    ("direction", "revisions", "expected"),
    [
        ("upgrade", f"{PlinkMigration.previous_revision}:{PlinkMigration.revision}", "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_users_phone_live ON users (phone) WHERE is_deleted = false AND phone IS NOT NULL"),
        ("downgrade", f"{PlinkMigration.revision}:{PlinkMigration.previous_revision}", "DROP INDEX CONCURRENTLY IF EXISTS ux_users_phone_live"),
    ],
)
def test_migration_sql_uses_concurrent_retry_safe_operations(direction: str, revisions: str, expected: str) -> None:
    environment: dict[str, str] = os.environ.copy()
    environment["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
    result: subprocess.CompletedProcess[str] = subprocess.run(
        [sys.executable, "-m", "alembic", direction, revisions, "--sql"],
        cwd=PlinkMigration.backend_root, env=environment, text=True, capture_output=True, timeout=30, check=False,
    )
    PlinkMigration.assert_command(result)
    assert expected in result.stdout
    assert "COMMIT;" in result.stdout


@pytest.mark.asyncio
async def test_upgrade_downgrade_reupgrade_preserves_users_and_enforces_the_constraints() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(PlinkMigration.backend_root) as database:
        PlinkMigration.assert_command(database.upgrade(PlinkMigration.previous_revision))
        assert not await PlinkMigration.email_is_nullable(database)
        await PlinkMigration.insert_user(database, "a@example.test", "+992900000001")
        await PlinkMigration.insert_user(database, "b@example.test", "+992900000001", deleted=True)
        await PlinkMigration.insert_user(database, "c@example.test", None)
        await PlinkMigration.insert_user(database, "d@example.test", None)

        PlinkMigration.assert_command(database.upgrade("head"))
        assert await database.fetchval("SELECT version_num FROM alembic_version") == PlinkMigration.revision
        assert await PlinkMigration.email_is_nullable(database)
        await PlinkMigration.assert_valid_unique_index(database)
        await PlinkMigration.insert_user(database, None, "+992900000002")
        await PlinkMigration.insert_user(database, None, None)
        with pytest.raises(asyncpg.UniqueViolationError):
            await PlinkMigration.insert_user(database, "e@example.test", "+992900000001")
        with pytest.raises(asyncpg.UniqueViolationError):
            await PlinkMigration.insert_user(database, "a@example.test", None)
        await PlinkMigration.insert_user(database, "f@example.test", "+992900000001", deleted=True)

        blocked: subprocess.CompletedProcess[str] = database.run_alembic("downgrade", "-1")
        assert blocked.returncode != 0
        assert "2 users have no email" in blocked.stdout + blocked.stderr
        assert await database.fetchval("SELECT version_num FROM alembic_version") == PlinkMigration.revision
        await PlinkMigration.assert_valid_unique_index(database)

        await database.execute("DELETE FROM users WHERE email IS NULL")
        PlinkMigration.assert_command(database.run_alembic("downgrade", "-1"))
        assert await database.fetchval("SELECT version_num FROM alembic_version") == PlinkMigration.previous_revision
        assert not await PlinkMigration.email_is_nullable(database)
        assert await database.fetchval("SELECT to_regclass($1)::text", PlinkMigration.index_name) is None
        assert await database.fetchval("SELECT count(*) FROM users") == 5

        PlinkMigration.assert_command(database.upgrade("head"))
        await PlinkMigration.assert_valid_unique_index(database)
        assert await database.fetchval("SELECT count(*) FROM users") == 5


@pytest.mark.asyncio
async def test_upgrade_refuses_with_a_count_message_when_live_users_share_a_phone() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(PlinkMigration.backend_root) as database:
        PlinkMigration.assert_command(database.upgrade(PlinkMigration.previous_revision))
        await PlinkMigration.insert_user(database, "a@example.test", "+992900000001")
        await PlinkMigration.insert_user(database, "b@example.test", "+992900000001")
        await PlinkMigration.insert_user(database, "c@example.test", "+992900000001")
        await PlinkMigration.insert_user(database, "d@example.test", "+992900000001", deleted=True)
        await PlinkMigration.insert_user(database, "e@example.test", "+992900000002")
        refused: subprocess.CompletedProcess[str] = database.upgrade("head")
        assert refused.returncode != 0
        assert "3 live users share a phone number" in refused.stdout + refused.stderr
        assert await database.fetchval("SELECT version_num FROM alembic_version") == PlinkMigration.previous_revision
        assert not await PlinkMigration.email_is_nullable(database)
        assert await database.fetchval("SELECT to_regclass($1)::text", PlinkMigration.index_name) is None


@pytest.mark.asyncio
async def test_upgrade_recovers_a_real_interrupted_concurrent_index_build() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(PlinkMigration.backend_root) as database:
        PlinkMigration.assert_command(database.upgrade(PlinkMigration.previous_revision))
        await PlinkMigration.insert_user(database, "a@example.test", "+992900000001")
        writer: asyncpg.Connection = await asyncpg.connect(**database._connection_parameters(database.database_url))
        builder: asyncpg.Connection = await asyncpg.connect(**database._connection_parameters(database.database_url))
        build: asyncio.Task[str] | None = None
        try:
            await writer.execute("BEGIN")
            await writer.execute("UPDATE users SET first_name='locked' WHERE email='a@example.test'")
            build = asyncio.create_task(builder.execute(
                f"CREATE UNIQUE INDEX CONCURRENTLY {PlinkMigration.index_name} ON users(phone) WHERE is_deleted = false AND phone IS NOT NULL"
            ))
            async with asyncio.timeout(10):
                while await database.fetchval("SELECT to_regclass($1)::text", PlinkMigration.index_name) is None:
                    await asyncio.sleep(0.02)
            assert await database.fetchval("SELECT pg_cancel_backend($1)", builder.get_server_pid())
            with pytest.raises(asyncpg.QueryCanceledError):
                await asyncio.wait_for(build, 5)
            assert await database.fetchval("SELECT indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)", PlinkMigration.index_name) is False
        finally:
            await writer.execute("ROLLBACK")
            if build is not None:
                await asyncio.gather(build, return_exceptions=True)
            await builder.close()
            await writer.close()
        PlinkMigration.assert_command(database.upgrade("head"))
        await PlinkMigration.assert_valid_unique_index(database)
