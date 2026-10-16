from sqlalchemy import Select, select
from sqlalchemy.dialects.postgresql import Insert, insert
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import SessionTransaction

from app.models.cache_generation import CacheGeneration


class SQLAlchemyCacheGenerationRepository:
    GENERATION_KEY: str = "finance_analytics"
    MUTATION_TRANSACTION_KEY: str = "finance_analytics_mutation_transaction"
    ADVANCED_TRANSACTION_KEY: str = "finance_analytics_advanced_transaction"
    ACCOUNT_LOCK_TRANSACTION_KEY: str = "finance_analytics_account_lock_transaction"

    def __init__(self, db: AsyncSession) -> None:
        self.db: AsyncSession = db
        bound_connection: AsyncEngine | AsyncConnection | None = db.bind
        committed_engine: AsyncEngine | None = bound_connection.engine if isinstance(bound_connection, AsyncConnection) else bound_connection
        self.committed_sessions: async_sessionmaker[AsyncSession] = async_sessionmaker(
            bind=committed_engine, expire_on_commit=False, autoflush=False,
        )

    async def advance(self) -> None:
        transaction: SessionTransaction | None = self.db.sync_session.get_nested_transaction() or self.db.sync_session.get_transaction()
        if transaction is not None and self.db.sync_session.info.get(self.ADVANCED_TRANSACTION_KEY) is transaction:
            return
        statement: Insert = insert(CacheGeneration).values(key=self.GENERATION_KEY, generation=1)
        statement = statement.on_conflict_do_update(
            index_elements=[CacheGeneration.key],
            set_={"generation": CacheGeneration.generation + 1},
        )
        await self.db.execute(statement)
        self.db.sync_session.info[self.MUTATION_TRANSACTION_KEY] = self.db.sync_session.get_transaction()
        self.db.sync_session.info[self.ADVANCED_TRANSACTION_KEY] = self.db.sync_session.get_nested_transaction() or self.db.sync_session.get_transaction()

    async def read_committed_generation(self) -> int:
        statement: Select[tuple[int]] = select(CacheGeneration.generation).where(CacheGeneration.key == self.GENERATION_KEY)
        session: AsyncSession
        async with self.committed_sessions() as session:
            generation: int | None = await session.scalar(statement)
        return generation if generation is not None else 0

    def mark_account_lock(self) -> None:
        self.db.sync_session.info[self.ACCOUNT_LOCK_TRANSACTION_KEY] = self.db.sync_session.get_transaction()

    def can_use_shared_cache(self) -> bool:
        transaction: SessionTransaction | None = self.db.sync_session.get_transaction()
        if transaction is None:
            return True
        return all(
            self.db.sync_session.info.get(key) is not transaction
            for key in (self.MUTATION_TRANSACTION_KEY, self.ACCOUNT_LOCK_TRANSACTION_KEY)
        )
