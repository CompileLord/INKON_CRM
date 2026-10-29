import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import settings


@pytest.mark.asyncio
async def test_lock_and_statement_deadlines_rollback_and_recover() -> None:
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy(DB_LOCK_TIMEOUT_MS=100, DB_STATEMENT_TIMEOUT_MS=300, DB_IDLE_TRANSACTION_TIMEOUT_MS=1000)
    engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, **policy.main_engine_options())
    blocker: AsyncConnection
    waiting: AsyncConnection
    try:
        async with engine.connect() as blocker, engine.connect() as waiting:
            await blocker.execute(text("SELECT pg_advisory_xact_lock(43001)"))
            with pytest.raises(DBAPIError, match="lock timeout"):
                await waiting.execute(text("SELECT pg_advisory_xact_lock(43001)"))
            await waiting.rollback()
            assert await waiting.scalar(text("SELECT 1")) == 1
            await waiting.rollback()
            with pytest.raises(DBAPIError, match="statement timeout"):
                await waiting.execute(text("SELECT pg_sleep(1)"))
            await waiting.rollback()
            assert await waiting.scalar(text("SELECT 1")) == 1
            await blocker.rollback()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_idle_transaction_deadline_invalidates_connection_and_pool_recovers() -> None:
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy(DB_LOCK_TIMEOUT_MS=50, DB_STATEMENT_TIMEOUT_MS=100, DB_IDLE_TRANSACTION_TIMEOUT_MS=150)
    engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, **policy.main_engine_options())
    connection: AsyncConnection
    try:
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT 1")) == 1
            await asyncio.sleep(0.35)
            with pytest.raises(DBAPIError):
                await connection.execute(text("SELECT 1"))
            await connection.rollback()
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT 1")) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_exhausted_pool_times_out_then_recovers_after_return() -> None:
    from sqlalchemy.exc import TimeoutError as PoolTimeoutError
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy(DB_POOL_SIZE=1, DB_MAX_OVERFLOW=0, DB_POOL_TIMEOUT_SECONDS=0.05)
    engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, **policy.main_engine_options())
    held: AsyncConnection
    recovered: AsyncConnection
    try:
        async with engine.connect() as held:
            assert await held.scalar(text("SELECT 1")) == 1
            with pytest.raises(PoolTimeoutError, match="connection timed out"):
                async with engine.connect():
                    pytest.fail("Exhausted pool unexpectedly admitted a connection")
        async with engine.connect() as recovered:
            assert await recovered.scalar(text("SELECT 1")) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_compose_profiles_measure_checkout_hold_and_session_counts() -> None:
    import json
    import math
    import os
    from time import perf_counter
    from typing import Any
    from uuid import uuid4
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy()
    revisions: int
    mode: str
    trial: int
    for revisions in (1, 2):
        for mode in ("previous", "bounded"):
            for trial in range(3):
                marker: str = f"wp43-{uuid4().hex}"
                engines: list[tuple[AsyncEngine, int]] = []
                waits: list[float] = []
                holds: list[float] = []
                totals: list[float] = []
                revision: int
                for revision in range(revisions):
                    kind: str
                    concurrency: int
                    profile_load: tuple[tuple[str, int], ...] = (
                        (("api", 9), ("worker", 9), ("outbox", 2), ("api_storage", 1), ("worker_storage", 1))
                        if os.environ.get("PYTEST_XDIST_WORKER")
                        else (("api", 16), ("worker", 16), ("outbox", 4), ("api_storage", 2), ("worker_storage", 2))
                    )
                    for kind, concurrency in profile_load:
                        options: dict[str, Any]
                        if kind.endswith("storage"):
                            options = {"pool_size": 1, "max_overflow": 0, "pool_pre_ping": True, "connect_args": {"server_settings": {"statement_timeout": "5000", "lock_timeout": "1000"}}}
                        elif mode == "previous":
                            options = {"pool_size": 2 if kind == "outbox" else 20, "max_overflow": 2 if kind == "outbox" else 10, "pool_pre_ping": True, "connect_args": {"server_settings": {}}}
                        else:
                            options = policy.main_engine_options(outbox=kind == "outbox")
                        options["connect_args"]["server_settings"]["application_name"] = marker
                        engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, **options)
                        engines.append((engine, concurrency))

                async def operation(active_engine: AsyncEngine) -> None:
                    started: float = perf_counter()
                    connection: AsyncConnection
                    async with active_engine.connect() as connection:
                        checked_out: float = perf_counter()
                        waits.append((checked_out - started) * 1000)
                        assert await connection.scalar(text("SELECT 1 FROM pg_sleep(0.003)")) == 1
                    finished: float = perf_counter()
                    holds.append((finished - checked_out) * 1000)
                    totals.append((finished - started) * 1000)

                peaks: list[int] = []
                monitoring_done: asyncio.Event = asyncio.Event()
                observer: AsyncEngine = create_async_engine(settings.DATABASE_URL, pool_size=1, max_overflow=0)

                async def observe_connections() -> None:
                    observed: AsyncConnection
                    async with observer.connect() as observed:
                        while not monitoring_done.is_set():
                            peaks.append(int(await observed.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE application_name = :marker"), {"marker": marker}) or 0))
                            await observed.rollback()
                            await asyncio.sleep(0.002)

                monitoring: asyncio.Task[None] = asyncio.create_task(observe_connections())
                monitor: AsyncConnection
                engine: AsyncEngine
                try:
                    for engine, concurrency in engines:
                        async with engine.connect() as monitor:
                            await monitor.execute(text("SELECT 1"))
                    await asyncio.gather(*(operation(engine) for engine, concurrency in engines for _ in range(concurrency)))
                    async with engines[0][0].connect() as monitor:
                        idle_transactions: int = int(await monitor.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE application_name = :marker AND state = 'idle in transaction'"), {"marker": marker}) or 0)
                        sessions: int = int(await monitor.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE application_name = :marker"), {"marker": marker}) or 0)
                    assert idle_transactions == 0
                    assert sessions <= (policy.revision_ceiling if mode == "bounded" else 66) * revisions
                    assert max(peaks, default=0) <= (policy.revision_ceiling if mode == "bounded" else 66) * revisions
                    ordered: list[float] = sorted(totals)
                    print(json.dumps({"mode": mode, "revisions": revisions, "trial": trial, "operations": len(totals), "checkout_mean_ms": sum(waits) / len(waits), "hold_mean_ms": sum(holds) / len(holds), "p95_ms": ordered[math.ceil(len(ordered) * 0.95) - 1], "p99_ms": ordered[math.ceil(len(ordered) * 0.99) - 1], "connections_peak": max(peaks, default=0), "connections_after_return": sessions, "idle_in_transaction": idle_transactions}))
                finally:
                    monitoring_done.set()
                    await monitoring
                    await observer.dispose()
                    for engine, concurrency in engines:
                        await engine.dispose()


@pytest.mark.asyncio
async def test_maintenance_deadline_and_nullpool_are_separate_from_request_policy() -> None:
    from sqlalchemy.pool import NullPool
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy(DB_STATEMENT_TIMEOUT_MS=100, DB_LOCK_TIMEOUT_MS=50, DB_MAINTENANCE_STATEMENT_TIMEOUT_MS=500, DB_MAINTENANCE_LOCK_TIMEOUT_MS=100)
    engine: AsyncEngine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool, connect_args={"server_settings": policy.server_settings(maintenance=True)})
    connection: AsyncConnection
    first_pid: int
    try:
        async with engine.connect() as connection:
            first_pid = int(await connection.scalar(text("SELECT pg_backend_pid()")))
            assert await connection.scalar(text("SELECT 1 FROM pg_sleep(0.2)")) == 1
            with pytest.raises(DBAPIError, match="statement timeout"):
                await connection.execute(text("SELECT pg_sleep(1)"))
            await connection.rollback()
            assert await connection.scalar(text("SELECT 1")) == 1
        async with engine.connect() as connection:
            assert await connection.scalar(text("SELECT pg_backend_pid()")) != first_pid
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_storage_intent_idle_deadline_preserves_existing_lock_statement_and_pool_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.db.storage_intent_session import StorageIntentSessions

    monkeypatch.setattr(settings, "DB_IDLE_TRANSACTION_TIMEOUT_MS", 150)
    sessions: StorageIntentSessions = StorageIntentSessions(settings.DATABASE_URL)
    connection: AsyncConnection
    try:
        assert sessions.engine.pool.size() == 1
        async with sessions.engine.connect() as connection:
            assert await connection.scalar(text("SHOW statement_timeout")) == "5s"
            assert await connection.scalar(text("SHOW lock_timeout")) == "1s"
            assert await connection.scalar(text("SHOW idle_in_transaction_session_timeout")) == "150ms"
            await asyncio.sleep(0.35)
            with pytest.raises(DBAPIError):
                await connection.execute(text("SELECT 1"))
            await connection.rollback()
        async with sessions.engine.connect() as connection:
            assert await connection.scalar(text("SELECT 1")) == 1
    finally:
        await sessions.close()
