import asyncio
import logging
import math
import uuid
from typing import Any
from fastapi import HTTPException, Request, status
from app.core.config import settings
from app.core.redis import redis_client

logger: logging.Logger = logging.getLogger(__name__)

RATE_LIMIT_LUA: str = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('GET', key)
if current and tonumber(current) >= limit then
    local pttl = redis.call('PTTL', key)
    local retry_after = 1
    if pttl > 0 then
        retry_after = math.ceil(pttl / 1000)
        if retry_after < 1 then
            retry_after = 1
        end
    elseif pttl == -1 then
        redis.call('EXPIRE', key, window)
        retry_after = window
    end
    return {0, retry_after, tonumber(current)}
end

local val = redis.call('INCR', key)
if val == 1 or redis.call('PTTL', key) == -1 then
    redis.call('EXPIRE', key, window)
end
local pttl = redis.call('PTTL', key)
local retry_after = 1
if pttl > 0 then
    retry_after = math.ceil(pttl / 1000)
    if retry_after < 1 then
        retry_after = 1
    end
end
if val > limit then
    return {0, retry_after, val}
end
return {1, retry_after, val}
"""

COOLDOWN_LUA: str = """
local key = KEYS[1]
local cooldown = tonumber(ARGV[1])
local exists = redis.call('EXISTS', key)
if exists == 1 then
    local pttl = redis.call('PTTL', key)
    local retry_after = 1
    if pttl > 0 then
        retry_after = math.ceil(pttl / 1000)
        if retry_after < 1 then
            retry_after = 1
        end
    elseif pttl == -1 then
        redis.call('EXPIRE', key, cooldown)
        retry_after = cooldown
    end
    return {0, retry_after}
end
redis.call('SET', key, '1', 'EX', cooldown)
return {1, cooldown}
"""

RESERVE_LOCKOUT_LUA: str = """
local key = KEYS[1]
local inflight_key = KEYS[2]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local res_id = ARGV[3]

local current = redis.call('GET', key)
local current_val = 0
if current then
    current_val = tonumber(current)
    if current_val >= limit then
        local pttl = redis.call('PTTL', key)
        local retry_after = 1
        if pttl > 0 then
            retry_after = math.ceil(pttl / 1000)
            if retry_after < 1 then
                retry_after = 1
            end
        elseif pttl == -1 then
            redis.call('PEXPIRE', key, window * 1000)
            redis.call('PEXPIRE', inflight_key, window * 1000)
            retry_after = window
        end
        return {0, retry_after, current_val}
    end
else
    redis.call('DEL', inflight_key)
end

if redis.call('HEXISTS', inflight_key, res_id) == 1 then
    return {1, 0, current_val}
end

local new_total = current_val + 1
if current then
    redis.call('SET', key, tostring(new_total), 'KEEPTTL')
else
    redis.call('SET', key, tostring(new_total), 'PX', window * 1000)
end
redis.call('HSET', inflight_key, res_id, '1')

local pttl = redis.call('PTTL', key)
if pttl <= 0 then
    redis.call('PEXPIRE', key, window * 1000)
    redis.call('PEXPIRE', inflight_key, window * 1000)
else
    redis.call('PEXPIRE', inflight_key, pttl)
end

if new_total > limit then
    redis.call('HDEL', inflight_key, res_id)
    redis.call('SET', key, tostring(current_val), 'KEEPTTL')
    local pttl_now = redis.call('PTTL', key)
    local retry_after = 1
    if pttl_now > 0 then
        retry_after = math.max(1, math.ceil(pttl_now / 1000))
    else
        retry_after = window
    end
    return {0, retry_after, current_val}
end

local pttl_now = redis.call('PTTL', key)
local retry_after = 1
if pttl_now > 0 then
    retry_after = math.max(1, math.ceil(pttl_now / 1000))
else
    retry_after = window
end

return {1, retry_after, new_total}
"""

COMMIT_LOCKOUT_FAILURE_LUA: str = """
local key = KEYS[1]
local inflight_key = KEYS[2]
local window = tonumber(ARGV[1])
local res_id = ARGV[2]

if res_id ~= '' then
    local exists = redis.call('EXISTS', key)
    if exists == 0 then
        redis.call('DEL', inflight_key)
        return 0
    end

    local was_inflight = redis.call('HEXISTS', inflight_key, res_id)
    if was_inflight == 0 then
        return 0
    end

    redis.call('HDEL', inflight_key, res_id)
    local pttl = redis.call('PTTL', key)
    if pttl <= 0 then
        redis.call('PEXPIRE', key, window * 1000)
    end
    local remaining_inflight = redis.call('HLEN', inflight_key)
    if remaining_inflight == 0 then
        redis.call('DEL', inflight_key)
    else
        local pttl_now = redis.call('PTTL', key)
        if pttl_now > 0 then
            redis.call('PEXPIRE', inflight_key, pttl_now)
        end
    end
    return 1
end

local current = redis.call('GET', key)
local val = 1
if current then
    val = tonumber(current) + 1
    redis.call('SET', key, tostring(val), 'KEEPTTL')
else
    redis.call('SET', key, '1', 'PX', window * 1000)
end
return 1
"""

COMMIT_LOCKOUT_SUCCESS_LUA: str = """
local key = KEYS[1]
local inflight_key = KEYS[2]
local res_id = ARGV[1]

if res_id == '' then
    redis.call('DEL', key)
    redis.call('DEL', inflight_key)
    return 0
end

local exists = redis.call('EXISTS', key)
if exists == 0 then
    redis.call('DEL', inflight_key)
    return 0
end

local was_inflight = redis.call('HEXISTS', inflight_key, res_id)
if was_inflight == 0 then
    return 0
end

redis.call('HDEL', inflight_key, res_id)

local remaining_inflight = redis.call('HLEN', inflight_key)
if remaining_inflight == 0 then
    redis.call('DEL', key)
    redis.call('DEL', inflight_key)
    return 0
else
    redis.call('SET', key, tostring(remaining_inflight), 'KEEPTTL')
    local pttl = redis.call('PTTL', key)
    if pttl > 0 then
        redis.call('PEXPIRE', inflight_key, pttl)
    end
    return remaining_inflight
end
"""

RELEASE_LOCKOUT_RESERVATION_LUA: str = """
local key = KEYS[1]
local inflight_key = KEYS[2]
local res_id = ARGV[1]

if res_id == '' then
    return 0
end

local exists = redis.call('EXISTS', key)
if exists == 0 then
    redis.call('DEL', inflight_key)
    return 0
end

local was_inflight = redis.call('HEXISTS', inflight_key, res_id)
if was_inflight == 0 then
    return 0
end

redis.call('HDEL', inflight_key, res_id)
local current = redis.call('GET', key)
if current then
    local val = tonumber(current) - 1
    local remaining_inflight = redis.call('HLEN', inflight_key)
    if val <= 0 and remaining_inflight == 0 then
        redis.call('DEL', key)
        redis.call('DEL', inflight_key)
    else
        redis.call('SET', key, tostring(math.max(0, val)), 'KEEPTTL')
        if remaining_inflight > 0 then
            local pttl = redis.call('PTTL', key)
            if pttl > 0 then
                redis.call('PEXPIRE', inflight_key, pttl)
            end
        else
            redis.call('DEL', inflight_key)
        end
    end
end
return 1
"""


class RateLimitResult:
    def __init__(self, allowed: bool, retry_after: int, current_count: int) -> None:
        self.allowed: bool = allowed
        self.retry_after: int = retry_after
        self.current_count: int = current_count


class LockoutReservation:
    def __init__(
        self,
        limiter: "AtomicRateLimiter",
        key: str,
        inflight_key: str,
        res_id: str,
        window_seconds: int,
    ) -> None:
        self._limiter: "AtomicRateLimiter" = limiter
        self._key: str = key
        self._inflight_key: str = inflight_key
        self._res_id: str = res_id
        self._window_seconds: int = window_seconds
        self._committed: bool = False

    @property
    def is_committed(self) -> bool:
        return self._committed

    async def commit_failure(self) -> None:
        if not self._committed:
            self._committed = True
            await asyncio.shield(
                self._limiter.commit_lockout_failure(
                    self._key,
                    self._inflight_key,
                    self._res_id,
                    self._window_seconds,
                )
            )

    async def commit_success(self) -> None:
        if not self._committed:
            self._committed = True
            await asyncio.shield(
                self._limiter.commit_lockout_success(
                    self._key,
                    self._inflight_key,
                    self._res_id,
                )
            )

    async def release(self) -> None:
        if not self._committed:
            self._committed = True
            await asyncio.shield(
                self._limiter.release_lockout_reservation(
                    self._key,
                    self._inflight_key,
                    self._res_id,
                )
            )


class AtomicRateLimiter:
    def __init__(self) -> None:
        self._redis = redis_client

    async def evaluate_limit(self, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        try:
            raw_result: Any = await self._redis.eval(
                RATE_LIMIT_LUA,
                1,
                key,
                limit,
                window_seconds,
            )
            allowed_flag: int = int(raw_result[0])
            retry_after: int = max(1, int(raw_result[1]))
            count: int = int(raw_result[2])
            return RateLimitResult(allowed=bool(allowed_flag == 1), retry_after=retry_after, current_count=count)
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Rate limiter backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def evaluate_cooldown(self, key: str, cooldown_seconds: int) -> RateLimitResult:
        try:
            raw_result: Any = await self._redis.eval(
                COOLDOWN_LUA,
                1,
                key,
                cooldown_seconds,
            )
            allowed_flag: int = int(raw_result[0])
            retry_after: int = max(1, int(raw_result[1]))
            return RateLimitResult(allowed=bool(allowed_flag == 1), retry_after=retry_after, current_count=0)
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Cooldown limiter backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def acquire(self, key: str, limit: int, window_seconds: int) -> None:
        result: RateLimitResult = await self.evaluate_limit(key, limit, window_seconds)
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(result.retry_after)},
            )

    async def reserve_lockout_slot(
        self,
        key: str,
        inflight_key: str,
        res_id: str,
        limit: int,
        window_seconds: int,
    ) -> None:
        try:
            raw_result: Any = await self._redis.eval(
                RESERVE_LOCKOUT_LUA,
                2,
                key,
                inflight_key,
                limit,
                window_seconds,
                res_id,
            )
            allowed_flag: int = int(raw_result[0])
            retry_after: int = max(1, int(raw_result[1]))
            if allowed_flag != 1:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many attempts. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Lockout reserve backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def commit_lockout_failure(
        self,
        key: str,
        inflight_key: str,
        res_id: str,
        window_seconds: int,
    ) -> None:
        try:
            await self._redis.eval(
                COMMIT_LOCKOUT_FAILURE_LUA,
                2,
                key,
                inflight_key,
                window_seconds,
                res_id,
            )
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Lockout record backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def commit_lockout_success(
        self,
        key: str,
        inflight_key: str,
        res_id: str,
    ) -> None:
        try:
            await self._redis.eval(
                COMMIT_LOCKOUT_SUCCESS_LUA,
                2,
                key,
                inflight_key,
                res_id,
            )
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Lockout success backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def release_lockout_reservation(
        self,
        key: str,
        inflight_key: str,
        res_id: str,
    ) -> None:
        try:
            await self._redis.eval(
                RELEASE_LOCKOUT_RESERVATION_LUA,
                2,
                key,
                inflight_key,
                res_id,
            )
        except HTTPException:
            raise
        except Exception as error:
            logger.error("Release reservation backend error: %s", type(error).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security service is currently unavailable. Please try again later.",
            ) from error

    async def clear(self, key: str) -> None:
        try:
            await self._redis.delete(key, f"{key}:inflight")
        except Exception as error:
            logger.warning("Failed to clear rate limit key: %s", type(error).__name__)


class AuthenticationRateLimiter:
    def __init__(self, atomic_limiter: AtomicRateLimiter | None = None) -> None:
        self._limiter: AtomicRateLimiter = atomic_limiter or AtomicRateLimiter()

    async def reserve_login_slot(self, email: str) -> LockoutReservation:
        lockout_key: str = f"auth:attempts:login:{email}"
        inflight_key: str = f"{lockout_key}:inflight"
        res_id: str = uuid.uuid4().hex
        await self._limiter.reserve_lockout_slot(
            lockout_key,
            inflight_key,
            res_id,
            settings.AUTH_LOGIN_LOCKOUT_LIMIT,
            settings.AUTH_LOGIN_LOCKOUT_WINDOW_SECONDS,
        )
        return LockoutReservation(
            self._limiter,
            lockout_key,
            inflight_key,
            res_id,
            settings.AUTH_LOGIN_LOCKOUT_WINDOW_SECONDS,
        )

    async def record_login_failure(self, email: str) -> None:
        lockout_key: str = f"auth:attempts:login:{email}"
        inflight_key: str = f"{lockout_key}:inflight"
        await self._limiter.commit_lockout_failure(
            lockout_key,
            inflight_key,
            "",
            settings.AUTH_LOGIN_LOCKOUT_WINDOW_SECONDS,
        )

    async def record_login_success(self, email: str) -> None:
        lockout_key: str = f"auth:attempts:login:{email}"
        await self._limiter.clear(lockout_key)

    async def consume_login_budget(self, email: str, client_ip: str) -> None:
        account_budget_key: str = f"auth:budget:login:account:{email}"
        await self._limiter.acquire(
            account_budget_key,
            settings.AUTH_LOGIN_RATE_LIMIT,
            settings.AUTH_LOGIN_RATE_WINDOW_SECONDS,
        )
        client_budget_key: str = f"auth:budget:login:client:{client_ip}"
        await self._limiter.acquire(
            client_budget_key,
            settings.AUTH_LOGIN_RATE_LIMIT,
            settings.AUTH_LOGIN_RATE_WINDOW_SECONDS,
        )
        aggregate_budget_key: str = "auth:budget:login:aggregate"
        await self._limiter.acquire(
            aggregate_budget_key,
            settings.AUTH_LOGIN_AGGREGATE_LIMIT,
            settings.AUTH_LOGIN_AGGREGATE_WINDOW_SECONDS,
        )

    async def reserve_verify_slot(self, email: str) -> LockoutReservation:
        lockout_key: str = f"auth:attempts:{email}"
        inflight_key: str = f"{lockout_key}:inflight"
        res_id: str = uuid.uuid4().hex
        await self._limiter.reserve_lockout_slot(
            lockout_key,
            inflight_key,
            res_id,
            settings.AUTH_VERIFY_LOCKOUT_LIMIT,
            settings.AUTH_VERIFY_LOCKOUT_WINDOW_SECONDS,
        )
        return LockoutReservation(
            self._limiter,
            lockout_key,
            inflight_key,
            res_id,
            settings.AUTH_VERIFY_LOCKOUT_WINDOW_SECONDS,
        )

    async def record_verify_failure(self, email: str) -> None:
        lockout_key: str = f"auth:attempts:{email}"
        inflight_key: str = f"{lockout_key}:inflight"
        await self._limiter.commit_lockout_failure(
            lockout_key,
            inflight_key,
            "",
            settings.AUTH_VERIFY_LOCKOUT_WINDOW_SECONDS,
        )

    async def record_verify_success(self, email: str) -> None:
        lockout_key: str = f"auth:attempts:{email}"
        await self._limiter.clear(lockout_key)

    async def consume_verify_budget(self, email: str, client_ip: str) -> None:
        account_budget_key: str = f"auth:budget:verify:account:{email}"
        await self._limiter.acquire(
            account_budget_key,
            settings.AUTH_VERIFY_RATE_LIMIT,
            settings.AUTH_VERIFY_RATE_WINDOW_SECONDS,
        )
        client_budget_key: str = f"auth:budget:verify:client:{client_ip}"
        await self._limiter.acquire(
            client_budget_key,
            settings.AUTH_VERIFY_RATE_LIMIT,
            settings.AUTH_VERIFY_RATE_WINDOW_SECONDS,
        )
        aggregate_budget_key: str = "auth:budget:verify:aggregate"
        await self._limiter.acquire(
            aggregate_budget_key,
            settings.AUTH_VERIFY_AGGREGATE_LIMIT,
            settings.AUTH_VERIFY_AGGREGATE_WINDOW_SECONDS,
        )

    async def check_resend_cooldown(self, email: str) -> None:
        cooldown_key: str = f"auth:cooldown:resend:{email}"
        result: RateLimitResult = await self._limiter.evaluate_cooldown(
            cooldown_key,
            settings.AUTH_RESEND_COOLDOWN_SECONDS,
        )
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another verification code.",
                headers={"Retry-After": str(result.retry_after)},
            )

    async def consume_resend_budgets(self, email: str, client_ip: str) -> None:
        account_budget_key: str = f"auth:budget:resend:account:{email}"
        await self._limiter.acquire(
            account_budget_key,
            settings.AUTH_RESEND_ACCOUNT_LIMIT,
            settings.AUTH_RESEND_ACCOUNT_WINDOW_SECONDS,
        )
        client_budget_key: str = f"auth:budget:resend:client:{client_ip}"
        await self._limiter.acquire(
            client_budget_key,
            settings.AUTH_RESEND_CLIENT_LIMIT,
            settings.AUTH_RESEND_CLIENT_WINDOW_SECONDS,
        )
        aggregate_budget_key: str = "auth:budget:resend:aggregate"
        await self._limiter.acquire(
            aggregate_budget_key,
            settings.AUTH_RESEND_AGGREGATE_LIMIT,
            settings.AUTH_RESEND_AGGREGATE_WINDOW_SECONDS,
        )

    async def consume_password_reset_budgets(self, email: str, client_ip: str) -> None:
        account_budget_key: str = f"auth:reset_request:{email}"
        await self._limiter.acquire(
            account_budget_key,
            settings.AUTH_RESET_REQUEST_LIMIT,
            settings.AUTH_RESET_REQUEST_WINDOW_SECONDS,
        )
        client_budget_key: str = f"auth:budget:reset:client:{client_ip}"
        await self._limiter.acquire(
            client_budget_key,
            settings.AUTH_RESET_CLIENT_LIMIT,
            settings.AUTH_RESET_CLIENT_WINDOW_SECONDS,
        )
        aggregate_budget_key: str = "auth:budget:reset:aggregate"
        await self._limiter.acquire(
            aggregate_budget_key,
            settings.AUTH_RESET_AGGREGATE_LIMIT,
            settings.AUTH_RESET_AGGREGATE_WINDOW_SECONDS,
        )


async def check_rate_limit(key: str, limit: int, window: int) -> None:
    limiter: AtomicRateLimiter = AtomicRateLimiter()
    await limiter.acquire(key, limit, window)


async def clear_rate_limit(key: str) -> None:
    limiter: AtomicRateLimiter = AtomicRateLimiter()
    await limiter.clear(key)


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def get_auth_rate_limiter() -> AuthenticationRateLimiter:
    return AuthenticationRateLimiter()
