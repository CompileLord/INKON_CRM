from datetime import datetime
from typing import Any

from sqlalchemy import exists, or_, select, update, delete, Select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.document import Document
from app.models.storage_intent import StorageIntent
from app.models.user import User


class SQLAlchemyStorageIntentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def add(self, intent: StorageIntent) -> None:
        self.session.add(intent)
        await self.session.flush()

    async def lock_pending(self, intent_id: str) -> StorageIntent | None:
        return (await self.session.execute(select(StorageIntent).where(
            StorageIntent.id == intent_id, StorageIntent.state == 'pending',
        ).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()

    async def remove(self, intent: StorageIntent) -> None:
        await self.session.delete(intent)
        await self.session.flush()

    async def claim(self, now: datetime, token: str, limit: int, lease_expires_at: datetime) -> list[StorageIntent]:
        statement: Select[tuple[StorageIntent]] = select(StorageIntent).where(or_(
            (StorageIntent.state == 'pending') & (StorageIntent.next_attempt_at <= now),
            (StorageIntent.state == 'claimed') & (StorageIntent.lease_expires_at <= now),
        )).order_by(StorageIntent.next_attempt_at, StorageIntent.id).limit(limit).with_for_update(skip_locked=True)
        intents: list[StorageIntent] = list((await self.session.execute(statement)).scalars())
        intent: StorageIntent
        for intent in intents:
            intent.state = 'claimed'
            intent.lease_token = token
            intent.lease_expires_at = lease_expires_at
            intent.attempts += 1
        await self.session.flush()
        return intents

    async def referenced(self, key: str) -> bool:
        variants: tuple[str, str, str] = (key, f'/storage/{key}', f'storage/{key}')
        statement: Select[tuple[bool]] = select(or_(
            exists().where(User.photo_path.in_(variants) | User.thumbnail_path.in_(variants)),
            exists().where(Course.photo_path.in_(variants)),
            exists().where(Document.file_path.in_(variants), Document.is_deleted.is_(False)),
        ))
        return bool((await self.session.execute(statement)).scalar_one())

    async def settle(self, intent_id: str, token: str, error: str | None, retry_at: datetime) -> bool:
        conditions: tuple[ColumnElement[bool], ...] = (StorageIntent.id == intent_id, StorageIntent.state == 'claimed', StorageIntent.lease_token == token)
        result: CursorResult[Any]
        if error is None:
            result = await self.session.execute(delete(StorageIntent).where(*conditions))
        else:
            result = await self.session.execute(update(StorageIntent).where(*conditions).values(
                state='pending', lease_token=None, lease_expires_at=None,
                last_error=error, next_attempt_at=retry_at,
            ))
        return bool(result.rowcount)
