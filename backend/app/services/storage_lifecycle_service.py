from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.storage_intent_session import StorageIntentSessions, storage_intent_sessions
from app.models.storage_intent import StorageIntent
from app.repositories.interfaces.storage_intent_repository import StorageIntentRepository
from app.repositories.sqlalchemy.storage_intent_repository import SQLAlchemyStorageIntentRepository
from app.services.storage_service import StorageService, get_storage_service


class StorageLifecycleService:
    def __init__(self, session: AsyncSession, storage: StorageService | None = None,
                 reservations: StorageIntentSessions | None = None) -> None:
        self.storage: StorageService = storage or get_storage_service()
        self.reservations: StorageIntentSessions = reservations or storage_intent_sessions
        self.repository: StorageIntentRepository = SQLAlchemyStorageIntentRepository(session)

    async def stage(self, content: bytes, entity_type: str, entity_id: int, filename: str) -> tuple[str, str]:
        key: str = self.storage.new_key(entity_type, entity_id, filename)
        self.storage.validate_key(key)
        intent_id: str = uuid4().hex
        reservation_session: AsyncSession
        async with self.reservations.factory() as reservation_session:
            repository: StorageIntentRepository = SQLAlchemyStorageIntentRepository(reservation_session)
            await repository.add(StorageIntent(id=intent_id, object_key=key, purpose='stage', state='pending',
                next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=10), attempts=0))
            await reservation_session.commit()
        intent: StorageIntent | None = await self.repository.lock_pending(intent_id)
        if intent is None or intent.object_key != key or intent.purpose != 'stage':
            raise RuntimeError('Storage reservation unavailable')
        path: str = await self.storage.write_reserved(content, key)
        return path, intent_id

    async def adopt(self, intent_id: str) -> None:
        intent: StorageIntent | None = await self.repository.lock_pending(intent_id)
        if intent is None:
            raise RuntimeError('Storage reservation unavailable')
        await self.repository.remove(intent)

    async def delete_after_commit(self, path: str | None) -> None:
        if path is None:
            return
        key: str = self.storage.canonical_key(path)
        await self.repository.add(StorageIntent(id=uuid4().hex, object_key=key, purpose='delete', state='pending',
            next_attempt_at=datetime.now(timezone.utc), attempts=0))
