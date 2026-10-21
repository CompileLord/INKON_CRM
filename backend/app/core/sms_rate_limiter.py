from fastapi import HTTPException, status

from app.core.config import settings
from app.core.rate_limiter import AtomicRateLimiter, RateLimitResult


class PasswordSmsRateLimiter:
    SECONDS_PER_DAY: int = 86400

    def __init__(self, atomic_limiter: AtomicRateLimiter | None = None) -> None:
        self._limiter: AtomicRateLimiter = atomic_limiter or AtomicRateLimiter()

    async def consume_ip_budget(self, client_ip: str) -> None:
        await self._limiter.acquire(
            f"sms:budget:password:ip:{client_ip}",
            settings.SMS_PASSWORD_IP_LIMIT,
            settings.SMS_PASSWORD_IP_WINDOW_SECONDS,
        )

    async def consume_budgets(self, user_id: int, phone: str, enforce_cooldown: bool = True) -> None:
        if enforce_cooldown:
            await self._consume_cooldown(user_id)
        await self._consume_delivery_budgets(user_id, phone)

    async def _consume_cooldown(self, user_id: int) -> None:
        cooldown_result: RateLimitResult = await self._limiter.evaluate_cooldown(
            f"sms:cooldown:password:{user_id}",
            settings.SMS_PASSWORD_RESEND_COOLDOWN_SECONDS,
        )
        if not cooldown_result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another password SMS.",
                headers={"Retry-After": str(cooldown_result.retry_after)},
            )

    async def _consume_delivery_budgets(self, user_id: int, phone: str) -> None:
        await self._limiter.acquire(
            f"sms:budget:password:account:{user_id}",
            settings.SMS_PASSWORD_ACCOUNT_LIMIT,
            settings.SMS_PASSWORD_ACCOUNT_WINDOW_SECONDS,
        )
        await self._limiter.acquire(
            f"sms:budget:password:phone:{phone}",
            settings.SMS_PASSWORD_PHONE_LIMIT,
            settings.SMS_PASSWORD_PHONE_WINDOW_SECONDS,
        )
        await self._limiter.acquire(
            f"sms:budget:password:phone_daily:{phone}",
            settings.SMS_PASSWORD_PHONE_DAILY_LIMIT,
            self.SECONDS_PER_DAY,
        )
        await self._limiter.acquire(
            "sms:budget:password:global_daily",
            settings.SMS_PASSWORD_GLOBAL_DAILY_LIMIT,
            self.SECONDS_PER_DAY,
        )
