from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories.interfaces.refresh_token_repository import RefreshTokenRepository
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository


class RefreshTokenRetentionWorker:
    retention: timedelta = timedelta(days=7)
    maximum_batch_size: int = 1000
    maximum_batches_per_run: int = 10

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        batch_size: int = 1000,
        max_batches: int = 10,
        repository_factory: Callable[[AsyncSession], RefreshTokenRepository] = SQLAlchemyRefreshTokenRepository,
    ) -> None:
        if not 1 <= batch_size <= self.maximum_batch_size or not 1 <= max_batches <= self.maximum_batches_per_run:
            raise ValueError("Refresh retention batch limits are outside the bounded run budget")
        self.session_factory: async_sessionmaker[AsyncSession] = session_factory
        self.repository_factory: Callable[[AsyncSession], RefreshTokenRepository] = repository_factory
        self.batch_size: int = batch_size
        self.max_batches: int = max_batches

    async def run(self, now: datetime | None = None) -> int:
        instant: datetime = now or datetime.now(timezone.utc)
        if instant.utcoffset() is None:
            raise ValueError("Refresh retention requires a timezone-aware UTC cutoff")
        cutoff: datetime = instant.astimezone(timezone.utc) - self.retention
        total: int = 0
        batch: int
        session: AsyncSession
        for batch in range(self.max_batches):
            async with self.session_factory() as session:
                repository: RefreshTokenRepository = self.repository_factory(session)
                deleted: int = await repository.purge_expired_before(cutoff, self.batch_size)
                await session.commit()
            total += deleted
            if deleted < self.batch_size:
                break
        return total


async def purge_expired_refresh_tokens(ctx: dict[str, Any] | None) -> int:
    from app.db.session import AsyncSessionLocal

    worker: RefreshTokenRetentionWorker = RefreshTokenRetentionWorker(AsyncSessionLocal)
    return await worker.run()
