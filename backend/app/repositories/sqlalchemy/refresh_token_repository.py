from datetime import datetime, timezone
from typing import Any
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.refresh_token import RefreshToken
from app.repositories.interfaces.refresh_token_repository import RefreshTokenRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyRefreshTokenRepository(SQLAlchemyBaseRepository[RefreshToken], RefreshTokenRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(RefreshToken, session)

    async def revoke_all_for_user(self, user_id: int) -> None:
        now = datetime.now(timezone.utc)
        statement = (
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at == None,
                RefreshToken.expires_at > now
            )
            .values(revoked_at=now)
        )
        await self.session.execute(statement)
        await self.session.flush()

    async def consume_valid_token(self, token_hash: str, user_id: int, now: datetime) -> bool:
        statement = (
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at == None,
                RefreshToken.expires_at > now,
            )
            .values(revoked_at=now)
            .returning(RefreshToken.id)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none() is not None

    async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int:
        eligibility: tuple = (
            RefreshToken.expires_at < cutoff,
            or_(RefreshToken.revoked_at.is_(None), RefreshToken.revoked_at < cutoff),
        )
        candidates: Any = (
            select(RefreshToken.id)
            .where(*eligibility)
            .order_by(RefreshToken.expires_at, RefreshToken.id)
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .cte("expired_refresh_tokens")
        )
        deleted: Any = (
            delete(RefreshToken)
            .where(RefreshToken.id.in_(select(candidates.c.id)), *eligibility)
            .returning(RefreshToken.id)
            .cte("deleted_refresh_tokens")
        )
        return int(await self.session.scalar(select(func.count()).select_from(deleted)) or 0)
