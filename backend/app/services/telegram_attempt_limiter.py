from enum import Enum
from typing import ClassVar
from app.core.rate_limiter import AtomicRateLimiter, RateLimitResult
from app.core.redis import redis_client


class AttemptDecision(str, Enum):
    ALLOWED = "allowed"
    CHAT_LOCKED = "chat_locked"
    GLOBALLY_LOCKED = "globally_locked"


RELEASE_ATTEMPT_LUA: str = """
local current = redis.call('GET', KEYS[1])
if current and tonumber(current) > 0 then
    return redis.call('DECR', KEYS[1])
end
return 0
"""


class TelegramAttemptLimiter:
    chat_limit: ClassVar[int] = 5
    global_limit: ClassVar[int] = 300
    window_seconds: ClassVar[int] = 3600

    def __init__(self) -> None:
        self._limiter: AtomicRateLimiter = AtomicRateLimiter()

    @staticmethod
    def chat_key(chat_id: int) -> str:
        return f"telegram_link:attempts:chat:{chat_id}"

    @staticmethod
    def global_key() -> str:
        return "telegram_link:attempts:global"

    async def reserve_attempt(self, chat_id: int) -> AttemptDecision:
        chat_result: RateLimitResult = await self._limiter.evaluate_limit(
            self.chat_key(chat_id), self.chat_limit, self.window_seconds
        )
        if not chat_result.allowed:
            return AttemptDecision.CHAT_LOCKED
        global_result: RateLimitResult = await self._limiter.evaluate_limit(
            self.global_key(), self.global_limit, self.window_seconds
        )
        if not global_result.allowed:
            await redis_client.eval(RELEASE_ATTEMPT_LUA, 1, self.chat_key(chat_id))
            return AttemptDecision.GLOBALLY_LOCKED
        return AttemptDecision.ALLOWED

    async def release_successful_attempt(self, chat_id: int) -> None:
        await redis_client.eval(RELEASE_ATTEMPT_LUA, 1, self.chat_key(chat_id))
        await redis_client.eval(RELEASE_ATTEMPT_LUA, 1, self.global_key())
