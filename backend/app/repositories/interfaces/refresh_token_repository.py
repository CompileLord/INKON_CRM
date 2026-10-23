from dataclasses import dataclass
from datetime import datetime
from typing_extensions import Protocol
from app.models.refresh_token import RefreshToken
from app.repositories.interfaces.base_repository import BaseRepository


@dataclass(frozen=True)
class ConsumedRefreshToken:
    family_id: str | None


@dataclass(frozen=True)
class RotatedRefreshToken:
    family_id: str
    rotated_at: datetime


class RefreshTokenRepository(BaseRepository[RefreshToken], Protocol):
    async def revoke_all_for_user(self, user_id: int) -> None:
        ...

    async def consume_valid_token(self, token_hash: str, user_id: int, now: datetime) -> bool: ...

    async def rotate_valid_token(
        self, token_hash: str, user_id: int, now: datetime
    ) -> ConsumedRefreshToken | None: ...

    async def find_rotated_token(self, token_hash: str, user_id: int) -> RotatedRefreshToken | None: ...

    async def family_has_active_token(self, family_id: str, now: datetime) -> bool: ...

    async def revoke_family(self, family_id: str, now: datetime) -> None: ...

    async def purge_expired_before(self, cutoff: datetime, batch_size: int) -> int: ...


class AuthRefreshTokenRepository(Protocol):
    async def create(self, entity: RefreshToken) -> RefreshToken: ...

    async def consume_valid_token(self, token_hash: str, user_id: int, now: datetime) -> bool: ...

    async def rotate_valid_token(
        self, token_hash: str, user_id: int, now: datetime
    ) -> ConsumedRefreshToken | None: ...

    async def find_rotated_token(self, token_hash: str, user_id: int) -> RotatedRefreshToken | None: ...

    async def family_has_active_token(self, family_id: str, now: datetime) -> bool: ...

    async def revoke_family(self, family_id: str, now: datetime) -> None: ...

    async def revoke_all_for_user(self, user_id: int) -> None: ...
