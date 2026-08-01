from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, update
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

    async def get_valid_token(self, token_hash: str) -> Optional[RefreshToken]:
        now = datetime.now(timezone.utc)
        query = select(RefreshToken).filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at == None,
            RefreshToken.expires_at > now
        )
        result = await self.session.execute(query)
        return result.scalars().first()
