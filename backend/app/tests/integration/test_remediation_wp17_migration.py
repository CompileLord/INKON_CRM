import asyncio
import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import event, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlalchemy.util.concurrency import await_only

from app.core.config import settings


class CredentialEpochMigrationScenario:
    def __init__(self) -> None:
        self.engine: AsyncEngine = create_async_engine(settings.DATABASE_URL)
        self.schema: str = f"wp17_migration_{uuid4().hex}"
        migration_path: Path = Path(__file__).resolve().parents[3] / "alembic/versions/rwp17_auth_version.py"
        specification = importlib.util.spec_from_file_location("wp17_epoch_migration", migration_path)
        assert specification is not None and specification.loader is not None
        self.migration: ModuleType = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(self.migration)

    async def create(self) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.execute(text(f'CREATE TABLE "{self.schema}".users (id integer PRIMARY KEY, auth_version integer NOT NULL DEFAULT 0)'))
            await connection.execute(text(f'INSERT INTO "{self.schema}".users (id) VALUES (1)'))

    async def connect(self) -> AsyncConnection:
        connection: AsyncConnection = await self.engine.connect()
        await connection.execute(text(f'SET search_path TO "{self.schema}"'))
        await connection.commit()
        return connection

    def downgrade(self, connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            self.migration.downgrade()

    def upgrade(self, connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            self.migration.upgrade()

    async def is_blocked(self, process_id: int) -> bool:
        async with self.engine.connect() as observer:
            return bool(await observer.scalar(text("SELECT cardinality(pg_blocking_pids(:process_id)) > 0"), {"process_id": process_id}))

    async def close(self) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.engine.dispose()


@pytest.mark.asyncio
async def test_zero_epoch_migration_can_downgrade_and_upgrade() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    connection: AsyncConnection = await scenario.connect()
    try:
        await connection.run_sync(scenario.downgrade)
        await connection.commit()
        await connection.run_sync(scenario.upgrade)
        await connection.commit()
        assert await connection.scalar(text("SELECT auth_version FROM users WHERE id = 1")) == 0
    finally:
        await connection.close()
        await scenario.close()


@pytest.mark.asyncio
async def test_downgrade_waits_for_prior_credential_writer_and_preserves_revocation() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    writer: AsyncConnection = await scenario.connect()
    downgrade_connection: AsyncConnection = await scenario.connect()
    downgrade_task: asyncio.Task[None] | None = None
    try:
        await writer.execute(text("UPDATE users SET auth_version = 1 WHERE id = 1"))
        downgrade_process_id: int = int(await downgrade_connection.scalar(text("SELECT pg_backend_pid()")))
        downgrade_task = asyncio.create_task(downgrade_connection.run_sync(scenario.downgrade))
        async with asyncio.timeout(5):
            while not await scenario.is_blocked(downgrade_process_id):
                await asyncio.sleep(0.01)
        await writer.commit()
        with pytest.raises(RuntimeError, match="credential revocations"):
            await downgrade_task
        await downgrade_connection.rollback()
        assert await writer.scalar(text("SELECT auth_version FROM users WHERE id = 1")) == 1
    finally:
        await writer.rollback()
        if downgrade_task is not None and not downgrade_task.done():
            downgrade_task.cancel()
            await asyncio.gather(downgrade_task, return_exceptions=True)
        await downgrade_connection.close()
        await writer.close()
        await scenario.close()


@pytest.mark.asyncio
async def test_downgrade_blocks_new_credential_writer_before_epoch_inspection() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    inspected: asyncio.Event = asyncio.Event()
    release_downgrade: asyncio.Event = asyncio.Event()
    writer: AsyncConnection = await scenario.connect()
    downgrade_connection: AsyncConnection = await scenario.connect()
    writer_task: asyncio.Task[bool] | None = None
    downgrade_task: asyncio.Task[None] | None = None

    async def pause_after_inspection() -> None:
        inspected.set()
        await release_downgrade.wait()

    def after_cursor_execute(connection: Connection, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        if statement.lstrip().upper().startswith("SELECT COUNT("):
            await_only(pause_after_inspection())

    async def revoke_credentials() -> bool:
        try:
            await writer.execute(text("UPDATE users SET auth_version = 1 WHERE id = 1"))
            await writer.commit()
            return True
        except DBAPIError:
            await writer.rollback()
            return False

    event.listen(downgrade_connection.sync_connection, "after_cursor_execute", after_cursor_execute)
    try:
        writer_process_id: int = int(await writer.scalar(text("SELECT pg_backend_pid()")))
        await writer.commit()
        downgrade_task = asyncio.create_task(downgrade_connection.run_sync(scenario.downgrade))
        await asyncio.wait_for(inspected.wait(), timeout=5)
        writer_task = asyncio.create_task(revoke_credentials())
        async with asyncio.timeout(5):
            while not writer_task.done() and not await scenario.is_blocked(writer_process_id):
                await asyncio.sleep(0.01)
        writer_was_blocked: bool = not writer_task.done()
        release_downgrade.set()
        await asyncio.wait_for(downgrade_task, timeout=5)
        await downgrade_connection.commit()
        writer_committed: bool = await asyncio.wait_for(writer_task, timeout=5)
        assert writer_was_blocked
        assert not writer_committed, "Downgrade discarded a concurrently committed credential revocation"
    finally:
        release_downgrade.set()
        for task in (writer_task, downgrade_task):
            if task is not None and not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        await downgrade_connection.close()
        await writer.close()
        await scenario.close()
