from datetime import datetime, timezone
from sqlalchemy import update
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
