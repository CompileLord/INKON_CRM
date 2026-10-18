import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.storage_intent_session import StorageIntentSessions, storage_intent_sessions
from app.models.storage_intent import StorageIntent
from app.repositories.interfaces.storage_intent_repository import StorageIntentRepository
from app.repositories.sqlalchemy.storage_intent_repository import SQLAlchemyStorageIntentRepository
from app.services.storage_service import StorageService, get_storage_service


logger: logging.Logger = logging.getLogger(__name__)


class StorageCleanupWorker:
    def __init__(self, sessions: StorageIntentSessions | None = None, storage: StorageService | None = None) -> None:
        self.sessions: StorageIntentSessions = sessions or storage_intent_sessions
        self.storage: StorageService = storage or get_storage_service()
        self.task: asyncio.Task[None] | None = None

    async def run_once(self, now: datetime | None = None) -> int:
        timestamp: datetime = now or datetime.now(timezone.utc)
        token: str = uuid4().hex
        session: AsyncSession
        async with self.sessions.factory() as session:
            repository: StorageIntentRepository = SQLAlchemyStorageIntentRepository(session)
            intents: list[StorageIntent] = await repository.claim(timestamp, token, 10, timestamp + timedelta(seconds=60))
            await session.commit()
        intent: StorageIntent
        for intent in intents:
            error: str | None = None
            try:
                if intent.purpose not in ('stage', 'delete'):
                    raise ValueError('Invalid storage intent purpose')
                key: str = self.storage.canonical_key(intent.object_key)
                async with self.sessions.factory() as session:
                    repository: StorageIntentRepository = SQLAlchemyStorageIntentRepository(session)
                    referenced: bool = await repository.referenced(key)
                if referenced:
                    error: str | None = 'object_still_referenced'
                else:
                    await self.storage.delete(key)
            except Exception as exception:
                error: str | None = type(exception).__name__
            async with self.sessions.factory() as session:
                repository: StorageIntentRepository = SQLAlchemyStorageIntentRepository(session)
                await repository.settle(intent.id, token, error, timestamp + timedelta(seconds=30))
                await session.commit()
        return len(intents)

    async def run(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception as error:
                logger.error('Storage cleanup failed: %s', type(error).__name__)
            await asyncio.sleep(5)

    async def start(self) -> None:
        self.task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        if self.task is not None:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        await self.sessions.close()
