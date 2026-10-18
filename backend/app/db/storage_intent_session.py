from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


class StorageIntentSessions:
    def __init__(self, database_url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(
            database_url, pool_size=1, max_overflow=0, pool_timeout=5, pool_pre_ping=True,
            connect_args={'server_settings': {'statement_timeout': '5000', 'lock_timeout': '1000'}},
        )
        self.factory: async_sessionmaker[AsyncSession] = async_sessionmaker(self.engine, expire_on_commit=False)

    async def close(self) -> None:
        await self.engine.dispose()


storage_intent_sessions: StorageIntentSessions = StorageIntentSessions(settings.DATABASE_URL)
