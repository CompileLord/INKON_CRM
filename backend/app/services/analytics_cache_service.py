import asyncio
from collections.abc import Awaitable, Callable
import json
import random
import secrets
import time
from typing import Protocol, TypeVar

from redis.exceptions import RedisError


RedisResult = TypeVar("RedisResult")


class AnalyticsCacheTransport(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, *, nx: bool = False, px: int | None = None) -> bool | None: ...

    async def eval(self, script: str, numkeys: int, *keys_and_args: str | int) -> object: ...


class AnalyticsCacheService:
    RELEASE_SCRIPT: str = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0"
    PUBLISH_SCRIPT: str = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]); return 1 end return 0"
    CACHE_SECONDS: int = 600
    COMMAND_SECONDS: float = 1.0
    MINIMUM_POLL_SECONDS: float = 0.02
    MAXIMUM_POLL_SECONDS: float = 0.06

    def __init__(self, client: AnalyticsCacheTransport, *, lease_milliseconds: int = 30000, wait_seconds: float = 5.0) -> None:
        if lease_milliseconds <= 0 or wait_seconds < 0:
            raise ValueError("Analytics lease must be positive and waiter timeout nonnegative")
        self.client: AnalyticsCacheTransport = client
        self.lease_milliseconds: int = lease_milliseconds
        self.wait_seconds: float = wait_seconds

    async def _command(self, command: Awaitable[RedisResult], timeout: float | None = None) -> RedisResult:
        return await asyncio.wait_for(command, timeout=self.COMMAND_SECONDS if timeout is None else timeout)

    async def get_or_compute(
        self,
        cache_key: str,
        compute: Callable[[], Awaitable[dict[str, object]]],
        can_publish: Callable[[], bool],
    ) -> dict[str, object]:
        lease_key: str = f"{cache_key}:lease"
        owner: str = secrets.token_hex(24)
        deadline: float = time.monotonic() + self.wait_seconds
        while True:
            remaining: float = max(0.001, deadline - time.monotonic())
            command_timeout: float = min(self.COMMAND_SECONDS, remaining)
            try:
                cached: str | None = await self._command(self.client.get(cache_key), command_timeout)
                if cached is not None:
                    return json.loads(cached)
                acquired: bool | None = await self._command(
                    self.client.set(lease_key, owner, nx=True, px=self.lease_milliseconds),
                    min(self.COMMAND_SECONDS, max(0.001, deadline - time.monotonic())),
                )
            except asyncio.CancelledError:
                await self._release(lease_key, owner)
                raise
            except (RedisError, TimeoutError):
                await self._release(lease_key, owner)
                return await compute()
            if acquired:
                return await self._compute_as_owner(cache_key, lease_key, owner, compute, can_publish)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return await compute()
            await asyncio.sleep(min(remaining, random.uniform(self.MINIMUM_POLL_SECONDS, self.MAXIMUM_POLL_SECONDS)))

    async def _compute_as_owner(
        self,
        cache_key: str,
        lease_key: str,
        owner: str,
        compute: Callable[[], Awaitable[dict[str, object]]],
        can_publish: Callable[[], bool],
    ) -> dict[str, object]:
        try:
            try:
                cached: str | None = await self._command(self.client.get(cache_key))
            except (RedisError, TimeoutError):
                return await compute()
            if cached is not None:
                return json.loads(cached)
            analytics: dict[str, object] = await compute()
            if can_publish():
                try:
                    await self._command(self.client.eval(
                        self.PUBLISH_SCRIPT, 2, lease_key, cache_key, owner, json.dumps(analytics), self.CACHE_SECONDS,
                    ))
                except (RedisError, TimeoutError):
                    pass
            return analytics
        finally:
            await self._release(lease_key, owner)

    async def _release(self, lease_key: str, owner: str) -> None:
        try:
            await self._command(self.client.eval(self.RELEASE_SCRIPT, 1, lease_key, owner))
        except (RedisError, TimeoutError):
            pass
