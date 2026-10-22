import time
from typing import Any, Protocol


class DenyListRedis(Protocol):
    async def set(self, key: str, value: str, *, ex: int) -> Any: ...

    async def get(self, key: str) -> Any: ...


class AccessTokenDenyListUnavailable(Exception):
    pass


class AccessTokenDenyList:
    key_prefix: str = "auth:denied_jti:"

    def __init__(self, redis: DenyListRedis) -> None:
        self.redis: DenyListRedis = redis

    async def deny(self, token_id: str, expires_at: int) -> None:
        remaining_seconds: int = expires_at - int(time.time())
        if remaining_seconds <= 0:
            return
        try:
            await self.redis.set(f"{self.key_prefix}{token_id}", "1", ex=remaining_seconds)
        except Exception as error:
            raise AccessTokenDenyListUnavailable() from error

    async def is_denied(self, token_id: str) -> bool:
        try:
            return await self.redis.get(f"{self.key_prefix}{token_id}") is not None
        except Exception as error:
            raise AccessTokenDenyListUnavailable() from error
