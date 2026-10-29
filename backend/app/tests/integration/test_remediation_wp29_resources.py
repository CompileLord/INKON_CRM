from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from redis.asyncio.connection import Connection
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis as redis_module
from app.core.config import settings
from app.models.outbox_event import OutboxEvent
from app.models.user import User
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.test_remediation_wp29 import NotificationScenario
from app.workers.outbox import OutboxWorkerManager


class TestNotificationOutboxResources:
    async def test_repeated_uploads_do_not_create_request_pools(
        self, test_student: User, test_admin: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import arq

        monkeypatch.setattr(settings, "TESTING", False)
        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        pool_creation: AsyncMock = AsyncMock(side_effect=AssertionError("request opened ARQ pool"))
        monkeypatch.setattr(arq, "create_pool", pool_creation)
        producer_access: AsyncMock = AsyncMock(side_effect=AssertionError("request accessed producer"))
        monkeypatch.setattr(redis_module, "get_arq_pool", producer_access)
        session: AsyncSession
        async with TestingSessionLocal() as session:
            upload_index: int
            for upload_index in range(3):
                await scenario.change(session, "document")
            await session.commit()
        pool_creation.assert_not_awaited()
        producer_access.assert_not_awaited()
        async with TestingSessionLocal() as session:
            events: list[OutboxEvent] = list((await session.scalars(select(OutboxEvent))).all())
            assert len(events) == 3


    async def test_upload_producer_lifecycle_measurements(
        self, test_student: User, test_admin: User, tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        import json
        from statistics import mean, pstdev
        from time import perf_counter

        import arq
        from redis.asyncio import Redis

        from app.workers.settings import outbox_worker_shutdown

        scenario: NotificationScenario = await NotificationScenario.create(test_student, test_admin, tmp_path)
        client_name: str = f"wp29-lifecycle-{uuid4().hex}"
        original_on_connect: Callable[[Connection], Awaitable[None]] = Connection.on_connect

        async def named_on_connect(connection: Connection) -> None:
            await original_on_connect(connection)
            await connection.send_command("CLIENT", "SETNAME", client_name)
            await connection.read_response()

        monkeypatch.setattr(Connection, "on_connect", named_on_connect)
        observer: Redis = Redis.from_url(settings.REDIS_URL)

        async def own_clients() -> int:
            listed_clients: list[dict[str, Any]] = await observer.client_list()
            return sum(1 for listed_client in listed_clients if listed_client.get("name") == client_name)

        await own_clients()
        pool_creation: AsyncMock = AsyncMock(wraps=arq.create_pool)
        monkeypatch.setattr(arq, "create_pool", pool_creation)
        monkeypatch.setattr(settings, "TESTING", False)
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        transaction_seconds: list[float] = []
        trials: list[dict[str, Any]] = []
        uploads: int = 3
        trial: int
        session: AsyncSession
        await redis_module.close_arq_pool()
        await redis_module.redis_client_owner.close()
        try:
            for trial in range(3):
                pool_creation.reset_mock()
                baseline_clients: int = await own_clients()
                started_at: float = perf_counter()
                async with TestingSessionLocal() as session:
                    upload_index: int
                    for upload_index in range(uploads):
                        await scenario.change(session, "document")
                    await session.commit()
                transaction_seconds.append(perf_counter() - started_at)
                request_pool_creations: int = pool_creation.await_count
                clients_after_requests: int = await own_clients()
                dispatched: int = await worker.run_once(TestingSessionLocal)
                dispatch_pool_creations: int = pool_creation.await_count
                clients_after_dispatch: int = await own_clients()
                await outbox_worker_shutdown({})
                clients_after_shutdown: int = await own_clients()
                trials.append({"trial": trial, "uploads": uploads,
                    "request_pool_creations": request_pool_creations, "total_pool_creations": dispatch_pool_creations,
                    "dispatched": dispatched, "clients_baseline": baseline_clients,
                    "clients_after_requests": clients_after_requests, "clients_after_dispatch": clients_after_dispatch,
                    "clients_after_shutdown": clients_after_shutdown, "transaction_seconds": transaction_seconds[-1]})
                queued_job: bytes
                for queued_job in await observer.zrange("arq:queue", 0, -1):
                    await observer.delete(b"arq:job:" + queued_job, b"arq:result:" + queued_job)
                await observer.delete("arq:queue")
                await redis_module.close_arq_pool()
            print(json.dumps({"trials": trials, "transaction_mean_seconds": mean(transaction_seconds),
                "transaction_stdev_seconds": pstdev(transaction_seconds)}))
            assert all(result["request_pool_creations"] == 0 for result in trials)
            assert all(result["total_pool_creations"] == 1 for result in trials)
            assert all(result["dispatched"] == uploads for result in trials)
            assert all(result["clients_after_requests"] == result["clients_baseline"] for result in trials)
            assert all(result["clients_after_shutdown"] == result["clients_baseline"] for result in trials)
        finally:
            await redis_module.close_arq_pool()
            await observer.aclose()
