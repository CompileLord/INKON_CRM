import logging
from fastapi import HTTPException, status
from app.core.redis import redis_client

logger = logging.getLogger(__name__)


async def check_rate_limit(key: str, limit: int, window: int) -> None:
    try:
        current = await redis_client.get(key)
        if current and int(current) >= limit:
            ttl = await redis_client.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(max(0, ttl))}
            )

        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        await pipe.execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Rate limiter failed open due to error: {e}")
        return


async def clear_rate_limit(key: str) -> None:
    try:
        await redis_client.delete(key)
    except Exception as e:
        logger.warning(f"Failed to clear rate limit key {key}: {e}")
