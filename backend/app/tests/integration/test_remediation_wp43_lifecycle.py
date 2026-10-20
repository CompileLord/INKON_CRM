import asyncio
from typing import Any
from unittest.mock import AsyncMock

import arq
import pytest
from arq.connections import ArqRedis, RedisSettings

from app.core import redis as redis_module


@pytest.mark.asyncio
async def test_concurrent_cold_producer_initialization_keeps_one_real_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    await redis_module.close_arq_pool()
    original_create: Any = arq.create_pool
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    created: list[ArqRedis] = []

    async def delayed_create(configuration: RedisSettings) -> ArqRedis:
        entered.set()
        await release.wait()
        pool: ArqRedis = await original_create(configuration)
        created.append(pool)
        return pool

    monkeypatch.setattr(arq, "create_pool", delayed_create)
    tasks: list[asyncio.Task[ArqRedis]] = [asyncio.create_task(redis_module.get_arq_pool()) for _ in range(12)]
    try:
        await asyncio.wait_for(entered.wait(), 2)
        await asyncio.sleep(0)
        release.set()
        pools: list[ArqRedis] = await asyncio.gather(*tasks)
        assert len(created) == 1
        assert all(pool is pools[0] for pool in pools)
        assert await pools[0].ping()
    finally:
        release.set()
        await asyncio.gather(*tasks, return_exceptions=True)
        await redis_module.close_arq_pool()
        pool: ArqRedis
        for pool in created:
            await pool.aclose()


@pytest.mark.asyncio
async def test_failed_cold_initialization_can_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    await redis_module.close_arq_pool()
    original_create: Any = arq.create_pool
    create: AsyncMock = AsyncMock(side_effect=RuntimeError("initialization failed"))
    monkeypatch.setattr(arq, "create_pool", create)
    with pytest.raises(RuntimeError, match="initialization failed"):
        await redis_module.get_arq_pool()
    monkeypatch.setattr(arq, "create_pool", original_create)
    try:
        pool: ArqRedis = await redis_module.get_arq_pool()
        assert await pool.ping()
    finally:
        await redis_module.close_arq_pool()


@pytest.mark.asyncio
async def test_cleanup_survives_repeated_cancellation_and_individual_failure() -> None:
    from app.core.resource_lifecycle import ResourceCleanup

    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    completed: list[str] = []

    async def slow_close() -> None:
        entered.set()
        await release.wait()
        completed.append("slow")

    async def failing_close() -> None:
        completed.append("failed")
        raise RuntimeError("close failed")

    async def final_close() -> None:
        completed.append("final")

    task: asyncio.Task[None] = asyncio.create_task(ResourceCleanup.close_all([slow_close, failing_close, final_close]))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert completed == ["slow", "failed", "final"]


@pytest.mark.asyncio
async def test_failed_worker_startup_stops_started_manager_and_closes_process_resources(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.resource_lifecycle import ProcessResources
    from app.workers import outbox, settings as worker_module, storage_cleanup

    manager: Any = AsyncMock()
    cleanup: Any = AsyncMock()
    cleanup.start.side_effect = RuntimeError("cleanup startup failed")
    close: AsyncMock = AsyncMock()
    def manager_factory(**kwargs: Any) -> Any:
        return manager

    def cleanup_factory() -> Any:
        return cleanup

    monkeypatch.setattr(outbox, "OutboxWorkerManager", manager_factory)
    monkeypatch.setattr(storage_cleanup, "StorageCleanupWorker", cleanup_factory)
    monkeypatch.setattr(ProcessResources, "close", close)
    context: dict[str, Any] = {}
    with pytest.raises(RuntimeError, match="cleanup startup failed"):
        await worker_module.outbox_worker_startup(context)
    manager.stop.assert_awaited_once()
    cleanup.stop.assert_awaited_once()
    close.assert_awaited_once()
    assert not context


@pytest.mark.asyncio
async def test_api_shutdown_attempts_every_owned_resource_after_close_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.resource_lifecycle import ProcessResources
    from app.db import session, storage_intent_session
    from app.telegram_bot import bot as bot_module

    bot_close: AsyncMock = AsyncMock(side_effect=RuntimeError("bot close failed"))
    arq_close: AsyncMock = AsyncMock()
    redis_close: AsyncMock = AsyncMock()
    engine_close: AsyncMock = AsyncMock()
    storage_close: AsyncMock = AsyncMock()
    monkeypatch.setattr(bot_module.bot.session, "close", bot_close)
    monkeypatch.setattr(redis_module, "close_arq_pool", arq_close)
    monkeypatch.setattr(redis_module.redis_client_owner, "close", redis_close)
    engine_probe: Any = AsyncMock()
    engine_probe.dispose = engine_close
    monkeypatch.setattr(session, "engine", engine_probe)
    monkeypatch.setattr(storage_intent_session.storage_intent_sessions, "close", storage_close)
    with pytest.raises(BaseExceptionGroup, match="Process resource cleanup failed"):
        await ProcessResources.close()
    bot_close.assert_awaited_once()
    arq_close.assert_awaited_once()
    redis_close.assert_awaited_once()
    engine_close.assert_awaited_once()
    storage_close.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancelled_worker_startup_stops_actual_outbox_background_task(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.resource_lifecycle import ProcessResources
    from app.workers import settings as worker_module, storage_cleanup

    entered: asyncio.Event = asyncio.Event()

    async def cancelled_start(self: Any) -> None:
        entered.set()
        await asyncio.Event().wait()

    close: AsyncMock = AsyncMock()
    monkeypatch.setattr(storage_cleanup.StorageCleanupWorker, "start", cancelled_start)
    monkeypatch.setattr(ProcessResources, "close", close)
    context: dict[str, Any] = {}
    task: asyncio.Task[None] = asyncio.create_task(worker_module.outbox_worker_startup(context))
    await asyncio.wait_for(entered.wait(), 2)
    manager: Any = context["outbox_worker"]
    background: asyncio.Task[None] = manager._worker_task
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert background.done()
    assert manager._engine is None
    assert not context
    close.assert_awaited_once()


@pytest.mark.asyncio
async def test_cancelled_cold_initialization_closes_created_client_before_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    await redis_module.close_arq_pool()
    original_create: Any = arq.create_pool
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    first_close: AsyncMock = AsyncMock()
    calls: int = 0

    async def delayed_create(configuration: RedisSettings) -> ArqRedis:
        nonlocal calls
        calls += 1
        pool: ArqRedis = await original_create(configuration)
        if calls == 1:
            first_close.side_effect = pool.aclose
            monkeypatch.setattr(pool, "aclose", first_close)
            entered.set()
            await release.wait()
        return pool

    monkeypatch.setattr(arq, "create_pool", delayed_create)
    task: asyncio.Task[ArqRedis] = asyncio.create_task(redis_module.get_arq_pool())
    await asyncio.wait_for(entered.wait(), 2)
    task.cancel()
    await asyncio.sleep(0)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    first_close.assert_awaited_once()
    try:
        pool: ArqRedis = await redis_module.get_arq_pool()
        assert await pool.ping()
        assert calls == 2
    finally:
        await redis_module.close_arq_pool()


@pytest.mark.asyncio
async def test_process_shutdown_removes_the_real_owned_redis_connection() -> None:
    from redis.asyncio import Redis
    from app.core.config import settings
    from app.core.resource_lifecycle import ProcessResources

    observer: Redis = Redis.from_url(settings.REDIS_URL)
    owned_identifier: int = int(await redis_module.redis_client_owner.client.client_id())
    try:
        before: list[dict[str, Any]] = await observer.client_list()
        assert any(int(client["id"]) == owned_identifier for client in before)
        await ProcessResources.close()
        after: list[dict[str, Any]] = await observer.client_list()
        assert all(int(client["id"]) != owned_identifier for client in after)
    finally:
        await observer.aclose()


@pytest.mark.asyncio
async def test_failed_producer_close_retains_handle_until_retry_and_other_closers_run(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.resource_lifecycle import ResourceCleanup

    owner: redis_module.ArqProducerOwner = redis_module.ArqProducerOwner()
    pool: Any = AsyncMock(spec=ArqRedis)
    pool.aclose.side_effect = [RuntimeError("pool close failed"), None]
    create: AsyncMock = AsyncMock(return_value=pool)
    other_close: AsyncMock = AsyncMock()
    monkeypatch.setattr(arq, "create_pool", create)
    assert await owner.get() is pool
    with pytest.raises(BaseExceptionGroup, match="Process resource cleanup failed"):
        await ResourceCleanup.close_all([owner.close, other_close])
    other_close.assert_awaited_once()
    assert owner.pool is pool
    with pytest.raises(RuntimeError, match="cleanup must be retried"):
        await owner.get()
    create.assert_awaited_once()
    await owner.close()
    assert owner.pool is None
    assert pool.aclose.await_count == 2


@pytest.mark.asyncio
async def test_cancelled_creation_retains_failed_close_handle_and_chains_cleanup_error(monkeypatch: pytest.MonkeyPatch) -> None:
    owner: redis_module.ArqProducerOwner = redis_module.ArqProducerOwner()
    pool: Any = AsyncMock(spec=ArqRedis)
    pool.aclose.side_effect = [RuntimeError("cancelled creation close failed"), None]
    entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()

    async def delayed_create(configuration: RedisSettings) -> ArqRedis:
        entered.set()
        await release.wait()
        return pool

    create: AsyncMock = AsyncMock(side_effect=delayed_create)
    monkeypatch.setattr(arq, "create_pool", create)
    task: asyncio.Task[ArqRedis] = asyncio.create_task(owner.get())
    await asyncio.wait_for(entered.wait(), 2)
    task.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError) as cancellation:
        await task
    assert isinstance(cancellation.value.__cause__, BaseExceptionGroup)
    assert owner.pool is pool
    with pytest.raises(RuntimeError, match="cleanup must be retried"):
        await owner.get()
    create.assert_awaited_once()
    await owner.close()
    assert owner.pool is None
    assert pool.aclose.await_count == 2
