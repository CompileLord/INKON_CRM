import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL,
    decode_responses=True
)


async def get_redis() -> aioredis.Redis:
    return redis_client


async def enqueue_job(job_name: str, *args, **kwargs) -> None:
    if settings.TESTING:
        return
    from arq import create_pool
    from arq.connections import RedisSettings
    redis_settings = RedisSettings(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT
    )
    pool = await create_pool(redis_settings)
    await pool.enqueue_job(job_name, *args, **kwargs)

