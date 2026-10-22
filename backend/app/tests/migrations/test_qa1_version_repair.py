import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase


class VersionRepairFixture:
    backend_root: str = str(Path(__file__).resolve().parents[3])
    revisions: list[str] = ["d025a01b34e5", "d4e5f6a7b8c9"]

    @classmethod
    def repair(cls, database: DisposableMigrationDatabase) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "scripts.repair_alembic_version"],
            cwd=cls.backend_root,
            env={"HOME": os.environ["HOME"], "PATH": os.environ["PATH"], "DATABASE_URL": database.database_url.render_as_string(hide_password=False)},
            text=True, capture_output=True, timeout=30, check=False,
        )

    @staticmethod
    async def versions(database: DisposableMigrationDatabase) -> list[str]:
        return await database.fetchval("SELECT coalesce(array_agg(version_num ORDER BY version_num), ARRAY[]::varchar[]) FROM alembic_version")

    @classmethod
    async def two_heads(cls, database: DisposableMigrationDatabase) -> None:
        result: subprocess.CompletedProcess[str] = database.upgrade("d025a01b34e5")
        assert result.returncode == 0, result.stderr
        await database.execute("INSERT INTO alembic_version VALUES ('d4e5f6a7b8c9')")


@pytest.mark.asyncio
async def test_two_old_heads_repair_twice_then_upgrade_to_head() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(VersionRepairFixture.backend_root) as database:
        await VersionRepairFixture.two_heads(database)
        overlap: subprocess.CompletedProcess[str] = database.upgrade("head")
        assert overlap.returncode != 0 and "overlaps" in overlap.stderr
        repaired: subprocess.CompletedProcess[str] = VersionRepairFixture.repair(database)
        assert repaired.returncode == 0, repaired.stderr
        assert "Repaired" in repaired.stdout
        assert await VersionRepairFixture.versions(database) == ["d025a01b34e5"]
        repeated: subprocess.CompletedProcess[str] = VersionRepairFixture.repair(database)
        assert repeated.returncode == 0 and "No change" in repeated.stdout
        assert await VersionRepairFixture.versions(database) == ["d025a01b34e5"]
        upgraded: subprocess.CompletedProcess[str] = database.upgrade("head")
        assert upgraded.returncode == 0, upgraded.stderr
        assert await VersionRepairFixture.versions(database) == [database.head_revision]


@pytest.mark.asyncio
@pytest.mark.parametrize("versions", [[], ["c91f0a4b7e19"], ["d4e5f6a7b8c9"], ["d025a01b34e5"], ["c91f0a4b7e19", "d4e5f6a7b8c9"], ["c91f0a4b7e19", "d025a01b34e5", "d4e5f6a7b8c9"]])
async def test_other_version_states_are_reported_unchanged(versions: list[str]) -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(VersionRepairFixture.backend_root) as database:
        await database.execute("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)")
        revision: str
        for revision in versions:
            await database.execute("INSERT INTO alembic_version VALUES ($1)", revision)
        result: subprocess.CompletedProcess[str] = VersionRepairFixture.repair(database)
        assert result.returncode == 0, result.stderr
        assert "No change" in result.stdout
        assert str(versions) in result.stdout
        assert await VersionRepairFixture.versions(database) == versions


@pytest.mark.asyncio
async def test_fresh_database_without_version_table_is_unchanged() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(VersionRepairFixture.backend_root) as database:
        result: subprocess.CompletedProcess[str] = VersionRepairFixture.repair(database)
        assert result.returncode == 0, result.stderr
        assert "No change" in result.stdout
        assert await database.fetchval("SELECT to_regclass('alembic_version')") is None


@pytest.mark.asyncio
async def test_two_heads_without_credentials_enum_value_refuses_without_deleting() -> None:
    database: DisposableMigrationDatabase
    async with DisposableMigrationDatabase(VersionRepairFixture.backend_root) as database:
        result: subprocess.CompletedProcess[str] = database.upgrade("c91f0a4b7e19")
        assert result.returncode == 0, result.stderr
        await database.execute("DELETE FROM alembic_version")
        await database.execute("INSERT INTO alembic_version VALUES ('d4e5f6a7b8c9'), ('d025a01b34e5')")
        refused: subprocess.CompletedProcess[str] = VersionRepairFixture.repair(database)
        assert refused.returncode != 0
        assert "credentials_email" in refused.stderr and "refused" in refused.stderr
        assert await VersionRepairFixture.versions(database) == VersionRepairFixture.revisions
