import asyncio
import json
import os
import statistics
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from arq import Retry, create_pool
from arq.connections import ArqRedis
from arq.worker import Worker
from httpx import AsyncClient, Response
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api.v1 import cron
from app.core import redis as redis_module
from app.workers import settings as worker_settings


ROUTES: tuple[tuple[str, str, int], ...] = (
    ("/api/v1/cron/archive-courses", "archive_expired_courses", 20),
    ("/api/v1/cron/payment-reminders", "check_payment_reminders", 4),
)
HEADERS: dict[str, str] = {"X-Cloud-Scheduler-Secret": "wp57-test-secret"}


@pytest_asyncio.fixture
async def maintenance_pool(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[ArqRedis, None]:
    worker_name: str | None = os.environ.get("PYTEST_XDIST_WORKER")
    if worker_name:
        monkeypatch.setattr(
            redis_module,
            "redis_connection_configuration",
            replace(redis_module.redis_connection_configuration, database=int(worker_name.removeprefix("gw"))),
        )
    pool: ArqRedis = await create_pool(redis_module.redis_connection_configuration.create_arq_settings())
    pool.default_queue_name = f"wp57:queue:{uuid4().hex}"
    await pool.flushdb()
    monkeypatch.setattr(redis_module, "get_arq_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(cron.settings, "CRON_SECRET", "wp57-test-secret")
    try:
        yield pool
    finally:
        await pool.flushdb()
        await pool.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
@pytest.mark.parametrize(("configured_secret", "header"), [
    (None, None), (None, "wrong-secret"), (None, "wp57-test-secret"),
    ("", None), ("", "wrong-secret"), ("", "wp57-test-secret"),
    ("wp57-test-secret", None), ("wp57-test-secret", "wrong-secret"),
])
async def test_unauthorized_requests_enqueue_nothing(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int, header: str | None, configured_secret: str | None,
) -> None:
    monkeypatch.setattr(cron.settings, "CRON_SECRET", configured_secret)
    headers: dict[str, str] = {} if header is None else {"X-Cloud-Scheduler-Secret": header}
    response: Response = await client.post(route, headers=headers)
    assert response.status_code == 401
    assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 0
    redis_module.get_arq_pool.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_concurrent_triggers_share_one_schedule_window(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int,
) -> None:
    scheduler: Any = getattr(worker_settings, "MaintenanceScheduler")
    monkeypatch.setattr(scheduler, "now", staticmethod(lambda: datetime(2026, 10, 22, hour, 1, tzinfo=timezone.utc)))
    trials: list[dict[str, Any]] = []
    enqueue_durations: list[float] = []
    original_enqueue: Callable[..., Awaitable[Any]] = maintenance_pool.enqueue_job

    async def measured_enqueue(*args: Any, **kwargs: Any) -> Any:
        started: float = time.perf_counter()
        try:
            return await original_enqueue(*args, **kwargs)
        finally:
            enqueue_durations.append(time.perf_counter() - started)

    monkeypatch.setattr(maintenance_pool, "enqueue_job", measured_enqueue)
    trial: int
    for trial in range(3):
        enqueue_durations.clear()
        gate: asyncio.Event = asyncio.Event()

        async def trigger() -> tuple[Response, float]:
            await gate.wait()
            started: float = time.perf_counter()
            response: Response = await client.post(route, headers=HEADERS)
            return response, time.perf_counter() - started

        requests: list[asyncio.Task[tuple[Response, float]]] = [asyncio.create_task(trigger()) for _ in range(30)]
        gate.set()
        responses: list[tuple[Response, float]] = await asyncio.gather(*requests)
        assert {response.status_code for response, _ in responses} == {202}
        identifiers: set[str] = {response.json()["job_id"] for response, _ in responses}
        assert identifiers == {f"maintenance:{task_name}:2026-10-22"}
        assert all(response.json()["status"] == "accepted" and response.json()["task"] == task_name for response, _ in responses)
        assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 1
        scheduled: Any = next(job for job in worker_settings.WorkerSettings.cron_jobs if job.hour == hour)
        await scheduled.coroutine({"redis": maintenance_pool})
        assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 1
        durations: list[float] = sorted(duration for _, duration in responses)
        trials.append({"trial": trial, "condition": "cold_queue" if trial == 0 else "warm_duplicate", "request_p95_seconds": durations[28], "request_mean_seconds": statistics.mean(durations), "enqueue_p95_seconds": sorted(enqueue_durations[:30])[28]})
    print(json.dumps({"task": task_name, "request_trials": trials}))


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_schedule_windows_roll_at_existing_utc_schedule(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int,
) -> None:
    scheduler: Any = getattr(worker_settings, "MaintenanceScheduler")
    monkeypatch.setattr(scheduler, "now", staticmethod(lambda: datetime(2026, 10, 22, hour - 1, 59, tzinfo=timezone.utc)))
    before: Response = await client.post(route, headers=HEADERS)
    monkeypatch.setattr(scheduler, "now", staticmethod(lambda: datetime(2026, 10, 22, hour, 0, tzinfo=timezone.utc)))
    after: Response = await client.post(route, headers=HEADERS)
    assert before.json()["job_id"] == f"maintenance:{task_name}:2026-10-21"
    assert after.json()["job_id"] == f"maintenance:{task_name}:2026-10-22"
    assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_http_only_enqueues_registered_job(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int,
) -> None:
    operation: AsyncMock = AsyncMock()
    operation.__name__ = task_name
    monkeypatch.setattr(cron, task_name, operation)
    monkeypatch.setattr(worker_settings, task_name, operation)
    response: Response = await client.post(route, headers=HEADERS)
    assert response.status_code == 202
    operation.assert_not_awaited()
    worker: Worker = Worker(
        functions=worker_settings.WorkerSettings.functions, redis_pool=maintenance_pool,
        queue_name=maintenance_pool.default_queue_name, burst=True, handle_signals=False,
    )
    try:
        await worker.async_run()
        assert worker.jobs_complete == 1
        operation.assert_awaited_once()
    finally:
        await worker.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_completed_window_is_not_reenqueued(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int,
) -> None:
    monkeypatch.setattr(worker_settings, task_name, AsyncMock())
    response: Response = await client.post(route, headers=HEADERS)
    worker: Worker = Worker(
        functions=worker_settings.WorkerSettings.functions, redis_pool=maintenance_pool,
        queue_name=maintenance_pool.default_queue_name, burst=True, handle_signals=False,
    )
    try:
        await worker.async_run()
        assert worker.jobs_complete == 1
        repeated: Response = await client.post(route, headers=HEADERS)
        assert repeated.json()["job_id"] == response.json()["job_id"]
        assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 0
        assert await maintenance_pool.ttl(f"arq:result:{response.json()['job_id']}") > 86400
    finally:
        await worker.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
@pytest.mark.parametrize("stage", ["pool", "enqueue"])
async def test_enqueue_failure_is_retryable_not_accepted(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int, stage: str,
) -> None:
    if stage == "pool":
        monkeypatch.setattr(redis_module, "get_arq_pool", AsyncMock(side_effect=RedisConnectionError("unavailable")))
    else:
        monkeypatch.setattr(maintenance_pool, "enqueue_job", AsyncMock(side_effect=RedisConnectionError("unavailable")))
    response: Response = await client.post(route, headers=HEADERS)
    assert response.status_code == 503
    assert response.headers["retry-after"] == "60"
    assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["pool", "enqueue"])
async def test_enqueue_deadline_bounds_request_wait(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch, stage: str,
) -> None:
    scheduler: Any = getattr(worker_settings, "MaintenanceScheduler")
    monkeypatch.setattr(scheduler, "enqueue_timeout_seconds", 0.02)
    gate: asyncio.Event = asyncio.Event()

    async def unavailable_pool() -> ArqRedis:
        await gate.wait()
        return maintenance_pool

    async def unavailable_enqueue(*args: Any, **kwargs: Any) -> None:
        await gate.wait()

    if stage == "pool":
        monkeypatch.setattr(redis_module, "get_arq_pool", unavailable_pool)
    else:
        monkeypatch.setattr(maintenance_pool, "enqueue_job", unavailable_enqueue)
    response: Response = await asyncio.wait_for(client.post(ROUTES[0][0], headers=HEADERS), timeout=0.5)
    assert response.status_code == 503
    assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_separate_workers_cannot_overlap_across_windows(
    maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch, route: str, task_name: str, hour: int,
) -> None:
    registered: Any = next(function for function in worker_settings.WorkerSettings.functions if getattr(function, "name", None) == task_name)
    second_pool: ArqRedis = await create_pool(redis_module.redis_connection_configuration.create_arq_settings())
    started: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()
    calls: int = 0
    active: int = 0
    peak_active: int = 0

    async def blocked_operation(context: dict[str, Any]) -> None:
        nonlocal calls, active, peak_active
        calls += 1
        active += 1
        peak_active = max(peak_active, active)
        started.set()
        await release.wait()
        active -= 1

    monkeypatch.setattr(worker_settings, task_name, blocked_operation)
    first: asyncio.Task[None] = asyncio.create_task(registered.coroutine({"redis": maintenance_pool, "job_id": "previous-window"}))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
        with pytest.raises(Retry):
            await asyncio.wait_for(registered.coroutine({"redis": second_pool, "job_id": "next-window"}), timeout=0.5)
        assert calls == 1
        assert peak_active == 1
        assert 600000 < await maintenance_pool.pttl(f"maintenance:lock:{task_name}") <= 660000
    finally:
        release.set()
        await first
        await second_pool.aclose()
    await registered.coroutine({"redis": maintenance_pool, "job_id": "next-window"})
    assert calls == 2
    assert await maintenance_pool.exists(f"maintenance:lock:{task_name}") == 0
    print(json.dumps({"task": task_name, "peak_active_jobs": peak_active}))


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_worker_retries_and_runtime_are_bounded(
    maintenance_pool: ArqRedis, route: str, task_name: str, hour: int,
) -> None:
    registered: Any = next(function for function in worker_settings.WorkerSettings.functions if getattr(function, "name", None) == task_name)
    assert registered.max_tries == 3
    assert registered.timeout_s == 600
    assert registered.keep_result_s == 172800
    await maintenance_pool.enqueue_job(task_name, _job_id=f"exhausted:{task_name}", _job_try=4)
    worker: Worker = Worker(
        functions=worker_settings.WorkerSettings.functions, redis_pool=maintenance_pool,
        queue_name=maintenance_pool.default_queue_name, burst=True, handle_signals=False,
    )
    try:
        await worker.async_run()
        assert worker.jobs_failed == 1
        assert worker.jobs_complete == 0
    finally:
        await worker.close()


@pytest.mark.asyncio
async def test_failed_operation_releases_overlap_lock(
    maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
) -> None:
    registered: Any = next(function for function in worker_settings.WorkerSettings.functions if getattr(function, "name", None) == "archive_expired_courses")
    monkeypatch.setattr(worker_settings, "archive_expired_courses", AsyncMock(side_effect=ValueError("failed operation")))
    with pytest.raises(ValueError, match="failed operation"):
        await registered.coroutine({"redis": maintenance_pool})
    assert await maintenance_pool.exists("maintenance:lock:archive_expired_courses") == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(("route", "task_name", "hour"), ROUTES)
async def test_internal_schedule_uses_the_same_queue_and_deduplication(
    client: AsyncClient, maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
    route: str, task_name: str, hour: int,
) -> None:
    operation: AsyncMock = AsyncMock()
    monkeypatch.setattr(worker_settings, task_name, operation)
    scheduled: Any = next(job for job in worker_settings.WorkerSettings.cron_jobs if job.hour == hour)
    await scheduled.coroutine({"redis": maintenance_pool})
    operation.assert_not_awaited()
    assert await maintenance_pool.zcard(maintenance_pool.default_queue_name) == 1
    response: Response = await client.post(route, headers=HEADERS)
    assert response.status_code == 202
    assert await maintenance_pool.zrange(maintenance_pool.default_queue_name, 0, -1) == [response.json()["job_id"].encode()]


@pytest.mark.asyncio
async def test_cancelled_operation_releases_overlap_lock(
    maintenance_pool: ArqRedis, monkeypatch: pytest.MonkeyPatch,
) -> None:
    registered: Any = next(function for function in worker_settings.WorkerSettings.functions if getattr(function, "name", None) == "archive_expired_courses")
    started: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()

    async def blocked_operation(context: dict[str, Any]) -> None:
        started.set()
        await release.wait()

    monkeypatch.setattr(worker_settings, "archive_expired_courses", blocked_operation)
    running: asyncio.Task[None] = asyncio.create_task(registered.coroutine({"redis": maintenance_pool}))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
    finally:
        running.cancel()
        with pytest.raises(asyncio.CancelledError):
            await running
    assert await maintenance_pool.exists("maintenance:lock:archive_expired_courses") == 0
