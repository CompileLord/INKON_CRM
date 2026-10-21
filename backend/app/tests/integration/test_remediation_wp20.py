import asyncio
from collections.abc import Awaitable, Callable
from datetime import date
from decimal import Decimal
import json
import os
import resource
import sys
import time
from typing import Any

import pytest
from sqlalchemy import event, select
from sqlalchemy.engine import Connection, ExecutionContext
from sqlalchemy.engine.interfaces import DBAPICursor
from sqlalchemy.pool.base import ConnectionPoolEntry
from sqlalchemy.util.queue import AsyncAdaptedQueue
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

import app.services.finance_service as finance_module
from app.models.user import User
from app.services.finance_service import FinanceService
from app.tests.conftest import RedisNamespaceClient, TEST_DATABASE_URL, TEST_REDIS_PREFIX, raw_test_redis


class AnalyticsWorker:
    @classmethod
    async def run(cls) -> None:
        client: RedisNamespaceClient = RedisNamespaceClient(raw_test_redis, os.environ["WP20_PREFIX"])
        finance_module.redis_client = client
        count: int = int(os.environ["WP20_REQUESTS"])
        total: int = int(os.environ["WP20_TOTAL"])
        engine: AsyncEngine = create_async_engine(TEST_DATABASE_URL, pool_size=count, max_overflow=0, pool_timeout=2)
        sessions: async_sessionmaker[AsyncSession] = async_sessionmaker(engine, expire_on_commit=False)
        sql_rows: list[int] = []
        sql_count: int = 0
        queue_wait_ms: list[float] = []
        queue: AsyncAdaptedQueue[ConnectionPoolEntry] = engine.sync_engine.pool._pool
        original_get: Callable[..., ConnectionPoolEntry] = queue.get

        def timed_queue_get(block: bool = True, timeout: float | None = None) -> ConnectionPoolEntry:
            started: float = time.perf_counter()
            try:
                return original_get(block, timeout)
            finally:
                queue_wait_ms.append((time.perf_counter() - started) * 1000)

        queue.get = timed_queue_get

        def record_sql(connection: Connection, cursor: DBAPICursor, statement: str, parameters: object, context: ExecutionContext, executemany: bool) -> None:
            nonlocal sql_count
            sql_count += 1
            sql_rows.append(max(0, cursor.rowcount))

        event.listen(engine.sync_engine, "after_cursor_execute", record_sql)

        class MeasuredFinanceService(FinanceService):
            async def _total_outstanding_credit(self) -> Decimal:
                await client._client.incr(f"{client._prefix}wp20:computations")
                await asyncio.sleep(float(os.environ.get("WP20_COMPUTE_DELAY", "0.15")))
                return await super()._total_outstanding_credit()

        async def request() -> dict[str, object]:
            session: AsyncSession
            async with sessions() as session:
                checkout_started: float = time.perf_counter()
                await session.execute(select(User.id).limit(1))
                checkout_ms: float = (time.perf_counter() - checkout_started) * 1000
                await client._client.incr(f"{client._prefix}wp20:ready")
                async with asyncio.timeout(20):
                    while int(await client.get("wp20:ready") or 0) < total:
                        await asyncio.sleep(0.005)
                started: float = time.perf_counter()
                result: dict[str, object] = await MeasuredFinanceService(session).get_analytics(date(2020, 1, 1), date(2099, 12, 31))
                return {"result": result, "latency_ms": (time.perf_counter() - started) * 1000, "checkout_ms": checkout_ms}

        try:
            results: list[dict[str, object]] = await asyncio.gather(*(request() for _ in range(count)))
            print(json.dumps({"pid": os.getpid(), "requests": results, "sql_calls": sql_count, "transferred_rows": sum(sql_rows), "sql_rowcounts": sql_rows, "pool_queue_wait_ms": queue_wait_ms, "rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))
        finally:
            await engine.dispose()
            await raw_test_redis.aclose()


class ConcurrentRequests:
    @staticmethod
    async def run(count: int = 30, delay: float = 0.15) -> list[dict[str, object]]:
        await raw_test_redis.delete(f"{TEST_REDIS_PREFIX}wp20:ready", f"{TEST_REDIS_PREFIX}wp20:computations")
        processes: list[asyncio.subprocess.Process] = []
        env: dict[str, str] = dict(os.environ, WP20_PREFIX=TEST_REDIS_PREFIX, WP20_TOTAL=str(count), WP20_COMPUTE_DELAY=str(delay))
        child_count: int
        for child_count in ([count] if count == 1 else [count // 2, count - count // 2]):
            processes.append(await asyncio.create_subprocess_exec(
                sys.executable, "-c", "import asyncio; from app.tests.integration.test_remediation_wp20 import AnalyticsWorker; asyncio.run(AnalyticsWorker.run())",
                env=dict(env, WP20_REQUESTS=str(child_count)), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            ))
        try:
            outputs: list[tuple[bytes, bytes]] = await asyncio.wait_for(asyncio.gather(*(process.communicate() for process in processes)), timeout=40)
            results: list[dict[str, object]] = []
            process: asyncio.subprocess.Process
            output: tuple[bytes, bytes]
            for process, output in zip(processes, outputs, strict=True):
                assert process.returncode == 0, output[1].decode()
                results.append(json.loads(output[0]))
            return results
        finally:
            for process in processes:
                if process.returncode is None:
                    process.kill()
                    await process.wait()


@pytest.mark.asyncio
async def test_two_processes_thirty_authenticated_cold_requests_recompute_once(test_student: User) -> None:
    workers: list[dict[str, object]] = await ConcurrentRequests.run()
    assert len({worker["pid"] for worker in workers}) == 2
    assert await raw_test_redis.get(f"{TEST_REDIS_PREFIX}wp20:computations") == "1"
    responses: list[dict[str, object]] = [request["result"] for worker in workers for request in worker["requests"]]
    assert len(responses) == 30
    assert all(response == responses[0] for response in responses)
    assert responses[0]["collected_in_period"] == "0.00"
    assert responses[0]["collection_rate"] == "0.0000"


class CacheScenario:
    def __init__(self, client: RedisNamespaceClient) -> None:
        self.client: RedisNamespaceClient = client
        self.calls: int = 0
        self.started: asyncio.Event = asyncio.Event()
        self.proceed: asyncio.Event = asyncio.Event()

    async def compute(self) -> dict[str, object]:
        self.calls += 1
        self.started.set()
        await asyncio.wait_for(self.proceed.wait(), timeout=5)
        return {"amount": "12.34", "winner": self.calls}

    def eligible(self) -> bool:
        return True


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["cancel", "exception"])
async def test_leader_failure_releases_lease_and_waiter_recovers(failure: str) -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)

    async def failing_compute() -> dict[str, object]:
        scenario.started.set()
        await scenario.proceed.wait()
        raise ValueError("leader failed")

    leader: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:failure", failing_compute, scenario.eligible))
    await asyncio.wait_for(scenario.started.wait(), timeout=3)
    waiter: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:failure", scenario.compute, scenario.eligible))
    if failure == "cancel":
        leader.cancel()
        with pytest.raises(asyncio.CancelledError):
            await leader
    else:
        scenario.proceed.set()
        with pytest.raises(ValueError, match="leader failed"):
            await leader
    scenario.proceed.set()
    assert (await asyncio.wait_for(waiter, timeout=3))["amount"] == "12.34"
    assert await finance_module.redis_client.get("wp20:failure:lease") is None


@pytest.mark.asyncio
async def test_expired_owner_cannot_publish_or_delete_successor_lease() -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client, lease_milliseconds=30_000)
    first: CacheScenario = CacheScenario(finance_module.redis_client)
    second: CacheScenario = CacheScenario(finance_module.redis_client)
    leader: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:expiry", first.compute, first.eligible))
    await asyncio.wait_for(first.started.wait(), timeout=5)
    assert await raw_test_redis.pexpire(f"{TEST_REDIS_PREFIX}wp20:expiry:lease", 0)
    successor: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:expiry", second.compute, second.eligible))
    await asyncio.wait_for(second.started.wait(), timeout=5)
    successor_owner: str | None = await finance_module.redis_client.get("wp20:expiry:lease")
    assert successor_owner is not None
    first.proceed.set()
    await leader
    assert await finance_module.redis_client.get("wp20:expiry") is None
    assert await finance_module.redis_client.get("wp20:expiry:lease") == successor_owner
    second.proceed.set()
    await successor
    assert json.loads(await finance_module.redis_client.get("wp20:expiry"))["amount"] == "12.34"


@pytest.mark.asyncio
async def test_bounded_waiter_computes_without_publishing_or_releasing_foreign_owner() -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    client: RedisNamespaceClient = finance_module.redis_client
    await client.set("wp20:timeout:lease", "foreign-owner", px=2000)
    cache: AnalyticsCacheService = AnalyticsCacheService(client, wait_seconds=0.08)
    scenario: CacheScenario = CacheScenario(client)
    scenario.proceed.set()
    started: float = time.monotonic()
    assert (await cache.get_or_compute("wp20:timeout", scenario.compute, scenario.eligible))["amount"] == "12.34"
    assert time.monotonic() - started < 0.5
    assert await client.get("wp20:timeout") is None
    assert await client.get("wp20:timeout:lease") == "foreign-owner"


@pytest.mark.asyncio
async def test_distinct_date_and_generation_keys_do_not_wait_for_old_leader() -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    blocked: CacheScenario = CacheScenario(finance_module.redis_client)
    leader: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("finance:analytics:v3:1:2020:2099", blocked.compute, blocked.eligible))
    await blocked.started.wait()
    current: CacheScenario = CacheScenario(finance_module.redis_client)
    current.proceed.set()
    try:
        for key in ["finance:analytics:v3:2:2020:2099", "finance:analytics:v3:1:2021:2099"]:
            assert (await asyncio.wait_for(cache.get_or_compute(key, current.compute, current.eligible), timeout=1))["amount"] == "12.34"
        assert current.calls == 2
    finally:
        blocked.proceed.set()
        await leader


@pytest.mark.asyncio
async def test_cache_is_rechecked_after_lease_acquisition(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)
    original_set: Callable[..., Awaitable[bool | None]] = finance_module.redis_client.set

    async def fill_before_acquisition(key: str, value: object, **options: Any) -> bool | None:
        if key == "wp20:recheck:lease":
            await original_set("wp20:recheck", json.dumps({"amount": "99.99"}))
        return await original_set(key, value, **options)

    monkeypatch.setattr(finance_module.redis_client, "set", fill_before_acquisition)
    assert (await cache.get_or_compute("wp20:recheck", scenario.compute, scenario.eligible))["amount"] == "99.99"
    assert scenario.calls == 0


@pytest.mark.asyncio
async def test_owner_is_random_finite_and_cancelled_waiter_cannot_release_it() -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)
    leader: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:owner", scenario.compute, scenario.eligible))
    await scenario.started.wait()
    owner: str | None = await finance_module.redis_client.get("wp20:owner:lease")
    assert owner is not None and len(owner) == 48
    assert 0 < await raw_test_redis.pttl(f"{TEST_REDIS_PREFIX}wp20:owner:lease") <= 30000
    waiter: asyncio.Task[dict[str, object]] = asyncio.create_task(cache.get_or_compute("wp20:owner", scenario.compute, scenario.eligible))
    await asyncio.sleep(0.05)
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    assert await finance_module.redis_client.get("wp20:owner:lease") == owner
    scenario.proceed.set()
    await leader
    assert await finance_module.redis_client.get("wp20:owner:lease") is None


@pytest.mark.asyncio
async def test_cancellation_after_redis_granted_lease_cleans_up_known_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    acquired: asyncio.Event = asyncio.Event()
    original_set: Callable[..., Awaitable[bool | None]] = finance_module.redis_client.set

    async def paused_set(key: str, value: object, **options: Any) -> bool | None:
        result: bool | None = await original_set(key, value, **options)
        acquired.set()
        await asyncio.Event().wait()
        return result

    monkeypatch.setattr(finance_module.redis_client, "set", paused_set)
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)
    task: asyncio.Task[dict[str, object]] = asyncio.create_task(AnalyticsCacheService(finance_module.redis_client).get_or_compute("wp20:cancel-acquire", scenario.compute, scenario.eligible))
    await acquired.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await finance_module.redis_client.get("wp20:cancel-acquire:lease") is None
    assert scenario.calls == 0


@pytest.mark.asyncio
async def test_changed_writer_generation_proceeds_while_old_generation_computation_is_paused(
    db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.tests.integration.test_remediation_wp19 import FinanceScenario, scenario as scenario_fixture

    scenario: FinanceScenario = await scenario_fixture.__wrapped__(db_session, test_admin, test_mentor, test_student)
    paused: asyncio.Event = asyncio.Event()
    proceed: asyncio.Event = asyncio.Event()
    original_compute: Callable[[FinanceService, date, date], Awaitable[dict[str, object]]] = FinanceService._compute_analytics
    leader: asyncio.Task[dict[str, object]] | None = None

    async def paused_compute(service: FinanceService, start: date, end: date) -> dict[str, object]:
        if asyncio.current_task() is leader:
            paused.set()
            await asyncio.wait_for(proceed.wait(), timeout=5)
        return await original_compute(service, start, end)

    monkeypatch.setattr(FinanceService, "_compute_analytics", paused_compute)
    leader = asyncio.create_task(scenario.analytics())
    await asyncio.wait_for(paused.wait(), timeout=3)
    try:
        session: AsyncSession
        from app.tests.conftest import TestingSessionLocal
        async with TestingSessionLocal() as session:
            await scenario.payment(session)
            await session.commit()
        current: dict[str, object] = await asyncio.wait_for(scenario.analytics(), timeout=3)
        assert current["collected_in_period"] == "10.00"
        assert not leader.done()
    finally:
        proceed.set()
        await leader
    assert (await scenario.analytics())["collected_in_period"] == "10.00"


@pytest.mark.asyncio
async def test_eligibility_change_before_publication_leaves_cache_empty() -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)
    scenario.proceed.set()
    assert (await cache.get_or_compute("wp20:ineligible", scenario.compute, lambda: False))["amount"] == "12.34"
    assert await finance_module.redis_client.get("wp20:ineligible") is None
    assert await finance_module.redis_client.get("wp20:ineligible:lease") is None


@pytest.mark.asyncio
async def test_redis_command_timeout_falls_back_once_without_unbounded_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.analytics_cache_service import AnalyticsCacheService

    async def stalled_get(key: str) -> str | None:
        await asyncio.Event().wait()
        return None

    monkeypatch.setattr(finance_module.redis_client, "get", stalled_get)
    cache: AnalyticsCacheService = AnalyticsCacheService(finance_module.redis_client)
    cache.COMMAND_SECONDS = 0.04
    scenario: CacheScenario = CacheScenario(finance_module.redis_client)
    scenario.proceed.set()
    started: float = time.monotonic()
    assert (await cache.get_or_compute("wp20:network-timeout", scenario.compute, scenario.eligible))["amount"] == "12.34"
    assert scenario.calls == 1
    assert time.monotonic() - started < 0.5
