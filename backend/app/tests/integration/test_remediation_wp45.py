import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.services.auth_service import AuthService
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.test_remediation_wp03 import encode_refresh_claims, issue_stored_refresh_token


class RetentionFixture:
    now: datetime = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)

    @classmethod
    async def seed(cls, student: User, dates: list[tuple[datetime, datetime | None]]) -> list[int]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            tokens: list[RefreshToken] = [RefreshToken(user_id=student.id, token_hash=uuid4().hex, expires_at=expiry, revoked_at=revocation) for expiry, revocation in dates]
            session.add_all(tokens)
            await session.commit()
            return [token.id for token in tokens]

    @classmethod
    async def remaining(cls) -> list[int]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            return list((await session.scalars(select(RefreshToken.id).order_by(RefreshToken.id))).all())


@pytest.mark.asyncio
async def test_strict_cutoff_keeps_live_recent_and_required_replay_evidence(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    now: datetime = RetentionFixture.now
    cutoff: datetime = now - timedelta(days=7)
    ids: list[int] = await RetentionFixture.seed(test_student, [
        (now - timedelta(days=20), None),
        (now - timedelta(days=20), now - timedelta(days=10)),
        (cutoff, None),
        (now - timedelta(days=8), now - timedelta(days=1)),
        (now - timedelta(days=1), None),
        (now + timedelta(days=1), None),
        (now + timedelta(days=1), now - timedelta(days=20)),
        (now - timedelta(days=8), cutoff),
    ])
    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal)
    assert await worker.run(now) == 2
    assert await RetentionFixture.remaining() == ids[2:]
    assert await worker.run(now) == 0


@pytest.mark.asyncio
async def test_batches_are_ordered_and_run_budget_is_bounded(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    now: datetime = RetentionFixture.now
    ids: list[int] = await RetentionFixture.seed(test_student, [(now - timedelta(days=10 + index), None) for index in range(5)])
    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=2, max_batches=1)
    assert await worker.run(now) == 2
    assert await RetentionFixture.remaining() == ids[:3]
    assert await worker.run(now) == 2
    assert await RetentionFixture.remaining() == ids[:1]
    assert await worker.run(now) == 1
    assert await worker.run(now) == 0


@pytest.mark.parametrize(("batch_size", "max_batches"), [(0, 1), (1001, 1), (1, 0), (1, 11)])
def test_invalid_batch_limits_fail_before_opening_a_session(batch_size: int, max_batches: int) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    with pytest.raises(ValueError, match="batch"):
        RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=batch_size, max_batches=max_batches)


@pytest.mark.asyncio
async def test_two_workers_skip_each_others_locks_without_double_deletion(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20), None)] * 5)
    barrier: asyncio.Barrier = asyncio.Barrier(2)

    class ConcurrentRepository(SQLAlchemyRefreshTokenRepository):
        async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
            deleted: int = await super().purge_expired_before(cutoff, batch_size)
            await barrier.wait()
            return deleted

    workers: list[RefreshTokenRetentionWorker] = [RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=2, max_batches=1, repository_factory=ConcurrentRepository) for _ in range(2)]
    results: list[int] = await asyncio.wait_for(asyncio.gather(*(worker.run(RetentionFixture.now) for worker in workers)), 10)
    assert results == [2, 2]
    assert len(await RetentionFixture.remaining()) == 1
    assert await RefreshTokenRetentionWorker(TestingSessionLocal).run(RetentionFixture.now) == 1


@pytest.mark.asyncio
async def test_cancelled_batch_rolls_back_and_restart_recovers(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    ids: list[int] = await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20), None)] * 3)
    deleted: asyncio.Event = asyncio.Event()

    class PausedRepository(SQLAlchemyRefreshTokenRepository):
        async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
            count: int = await super().purge_expired_before(cutoff, batch_size)
            deleted.set()
            await asyncio.Event().wait()
            return count

    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, repository_factory=PausedRepository)
    task: asyncio.Task[int] = asyncio.create_task(worker.run(RetentionFixture.now))
    await asyncio.wait_for(deleted.wait(), 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await RetentionFixture.remaining() == ids
    assert await RefreshTokenRetentionWorker(TestingSessionLocal).run(RetentionFixture.now) == 3


@pytest.mark.asyncio
async def test_committed_batch_survives_next_batch_failure_and_retry_is_idempotent(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    ids: list[int] = await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20), None)] * 5)
    calls: int = 0

    class FailingRepository(SQLAlchemyRefreshTokenRepository):
        async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
            nonlocal calls
            calls += 1
            count: int = await super().purge_expired_before(cutoff, batch_size)
            if calls == 2:
                raise RuntimeError("second batch failed")
            return count

    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=2, repository_factory=FailingRepository)
    with pytest.raises(RuntimeError, match="second batch failed"):
        await worker.run(RetentionFixture.now)
    assert await RetentionFixture.remaining() == ids[2:]
    recovery: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=2)
    assert await recovery.run(RetentionFixture.now) == 3
    assert await recovery.run(RetentionFixture.now) == 0


@pytest.mark.asyncio
async def test_locked_token_extended_to_live_is_retained_on_retry(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    ids: list[int] = await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20), None)])
    session: AsyncSession
    async with TestingSessionLocal() as session:
        token: RefreshToken = (await session.scalars(select(RefreshToken).with_for_update())).one()
        token.expires_at = RetentionFixture.now + timedelta(days=1)
        await session.flush()
        worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal)
        assert await asyncio.wait_for(worker.run(RetentionFixture.now), 2) == 0
        await session.commit()
    assert await worker.run(RetentionFixture.now) == 0
    assert await RetentionFixture.remaining() == ids


@pytest.mark.asyncio
async def test_refresh_rotation_and_replay_protection_survive_concurrent_cleanup(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    now: datetime = datetime.now(timezone.utc)
    await RetentionFixture.seed(test_student, [(now - timedelta(days=20), None)])
    token: str = encode_refresh_claims(str(test_student.id), "refresh", now + timedelta(minutes=5))
    session: AsyncSession
    async with TestingSessionLocal() as session:
        original: RefreshToken = await issue_stored_refresh_token(session, test_student, token)
        original_id: int = original.id
    deleted: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()

    class PausedRepository(SQLAlchemyRefreshTokenRepository):
        async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
            count: int = await super().purge_expired_before(cutoff, batch_size)
            deleted.set()
            await release.wait()
            return count

    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, max_batches=1, repository_factory=PausedRepository)
    task: asyncio.Task[int] = asyncio.create_task(worker.run(now))
    try:
        await asyncio.wait_for(deleted.wait(), 5)
        async with TestingSessionLocal() as session:
            rotated: Any = await asyncio.wait_for(AuthService(session).refresh(token), 2)
            assert rotated.refresh_token != token
            await session.commit()
        release.set()
        assert await task == 1
        async with TestingSessionLocal() as session:
            evidence: RefreshToken | None = await session.get(RefreshToken, original_id)
            assert evidence is not None and evidence.revoked_at is not None
            with pytest.raises(HTTPException) as failure:
                await AuthService(session).refresh(token)
            assert failure.value.status_code == 401
            assert await session.scalar(select(func.count()).select_from(RefreshToken)) == 2
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_cleanup_ordering_is_backed_by_expiry_index(test_student: User) -> None:
    from sqlalchemy import text

    await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20 + index), None) for index in range(50)])
    session: AsyncSession
    async with TestingSessionLocal() as session:
        index_names: list[str] = list((await session.scalars(text("SELECT indexname FROM pg_indexes WHERE tablename = 'refresh_tokens'"))).all())
        assert "ix_refresh_tokens_expires_at_id" in index_names
        await session.execute(text("SET LOCAL enable_seqscan = off"))
        plan_rows: list[str] = list((await session.scalars(text(
            "EXPLAIN SELECT id FROM refresh_tokens WHERE expires_at < :cutoff ORDER BY expires_at, id LIMIT 10"
        ).bindparams(cutoff=RetentionFixture.now))).all())
        assert any("ix_refresh_tokens_expires_at_id" in row for row in plan_rows)


def test_worker_settings_schedule_bounded_retention_job() -> None:
    from app.workers.settings import WorkerSettings
    from app.workers.token_retention import purge_expired_refresh_tokens

    scheduled: list[Any] = [job for job in WorkerSettings.cron_jobs if job.coroutine is purge_expired_refresh_tokens]
    assert len(scheduled) == 1
    assert any(getattr(function, "coroutine", function) is purge_expired_refresh_tokens for function in WorkerSettings.functions)


@pytest.mark.asyncio
async def test_run_stops_after_first_short_batch(test_student: User) -> None:
    from app.workers.token_retention import RefreshTokenRetentionWorker

    await RetentionFixture.seed(test_student, [(RetentionFixture.now - timedelta(days=20), None)])
    calls: int = 0

    class CountingRepository(SQLAlchemyRefreshTokenRepository):
        async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
            nonlocal calls
            calls += 1
            return await super().purge_expired_before(cutoff, batch_size)

    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(TestingSessionLocal, batch_size=2, max_batches=5, repository_factory=CountingRepository)
    assert await worker.run(RetentionFixture.now) == 1
    assert calls == 1
