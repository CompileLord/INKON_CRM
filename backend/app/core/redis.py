import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL,
    decode_responses=True
)


async def get_redis() -> aioredis.Redis:
    return redis_client


_arq_pool = None


async def get_arq_pool():
    global _arq_pool
    if _arq_pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings
        redis_settings = RedisSettings(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT
        )
        _arq_pool = await create_pool(redis_settings)
    return _arq_pool


async def enqueue_job(job_name: str, *args, **kwargs) -> None:
    if settings.TESTING:
        return
    pool = await get_arq_pool()
    await pool.enqueue_job(job_name, *args, **kwargs)


async def close_arq_pool() -> None:
    global _arq_pool
    if _arq_pool is not None:
        await _arq_pool.close()
        _arq_pool = None

