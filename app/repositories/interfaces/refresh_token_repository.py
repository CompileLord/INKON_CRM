from typing import Optional
from typing_extensions import Protocol
from app.models.refresh_token import RefreshToken
from app.repositories.interfaces.base_repository import BaseRepository


class RefreshTokenRepository(BaseRepository[RefreshToken], Protocol):
    async def revoke_all_for_user(self, user_id: int) -> None:
        ...

    async def get_valid_token(self, token_hash: str) -> Optional[RefreshToken]:
        ...
