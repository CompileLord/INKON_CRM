from fastapi import HTTPException, status

from app.core.config import settings
from app.core.rate_limiter import AtomicRateLimiter, RateLimitResult


class PasswordSmsRateLimiter:
    SECONDS_PER_DAY: int = 86400

    def __init__(self, atomic_limiter: AtomicRateLimiter | None = None) -> None:
        self._limiter: AtomicRateLimiter = atomic_limiter or AtomicRateLimiter()

    async def consume_budgets(self, user_id: int, phone: str) -> None:
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
