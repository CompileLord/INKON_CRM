import asyncio
from dataclasses import dataclass, field
from typing import Any, Mapping
from urllib.parse import urlsplit

import redis.asyncio as aioredis
from arq.connections import ArqRedis, RedisSettings
from redis.asyncio.connection import ConnectionPool, parse_url

from app.core.config import settings


@dataclass(frozen=True, repr=False)
class RedisConnectionConfiguration:
    url: str = field(repr=False)
    host: str
    port: int
    database: int
    username: str | None = field(repr=False)
    password: str | None = field(repr=False)
    tls_enabled: bool
    connection_options: Mapping[str, Any] = field(repr=False)

    @classmethod
    def from_url(cls, redis_url: str) -> "RedisConnectionConfiguration":
        parsed_url = urlsplit(redis_url)
        if parsed_url.scheme not in {"redis", "rediss"}:
            raise ValueError("Redis URL must use redis or rediss")

        connection_options: dict[str, Any] = parse_url(redis_url)
        tls_enabled: bool = parsed_url.scheme == "rediss"
        if tls_enabled:
            connection_options["ssl_cert_reqs"] = "required"
            connection_options["ssl_check_hostname"] = True
        return cls(
            url=redis_url,
            host=str(connection_options.get("host", "localhost")),
            port=int(connection_options.get("port", 6379)),
            database=int(connection_options.get("db", 0)),
            username=connection_options.get("username"),
            password=connection_options.get("password"),
            tls_enabled=tls_enabled,
            connection_options=connection_options,
        )

    def create_client(self, decode_responses: bool = True) -> aioredis.Redis:
        connection_options: dict[str, Any] = dict(self.connection_options)
        connection_options["decode_responses"] = decode_responses
        pool: ConnectionPool = ConnectionPool(**connection_options)
        return aioredis.Redis.from_pool(pool)

    def create_arq_settings(self) -> RedisSettings:
        settings_values: dict[str, Any] = {
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "username": self.username,
            "password": self.password,
            "ssl": self.tls_enabled,
        }
        for setting_name in (
            "ssl_keyfile",
            "ssl_certfile",
            "ssl_cert_reqs",
            "ssl_ca_certs",
            "ssl_ca_data",
            "ssl_check_hostname",
            "conn_timeout",
            "conn_retries",
            "conn_retry_delay",
            "max_connections",
        ):
            if setting_name in self.connection_options:
                settings_values[setting_name] = self.connection_options[setting_name]
        return RedisSettings(**settings_values)


redis_connection_configuration: RedisConnectionConfiguration = (
    RedisConnectionConfiguration.from_url(settings.REDIS_URL)
)
class RedisClientOwner:
    def __init__(self, client: aioredis.Redis) -> None:
        self.client: aioredis.Redis = client

    async def close(self) -> None:
        await self.client.aclose()


redis_client_owner: RedisClientOwner = RedisClientOwner(redis_connection_configuration.create_client())
redis_client: aioredis.Redis = redis_client_owner.client


async def get_redis() -> aioredis.Redis:
    return redis_client


class ArqProducerOwner:
    def __init__(self) -> None:
        self.pool: ArqRedis | None = None
        self.cleanup_pending: bool = False
        self.lock: asyncio.Lock = asyncio.Lock()
        self.loop: asyncio.AbstractEventLoop | None = None

    def current_lock(self) -> asyncio.Lock:
        loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
        if self.loop is not loop:
            if self.pool is not None:
                raise RuntimeError("ARQ producer must be closed before changing event loops")
            self.lock = asyncio.Lock()
            self.loop = loop
        return self.lock

    async def get(self) -> ArqRedis:
        async with self.current_lock():
            if self.cleanup_pending:
                raise RuntimeError("ARQ producer cleanup must be retried before use")
            if self.pool is None:
                from arq import create_pool
                from app.core.resource_lifecycle import ResourceCleanup

                creation: asyncio.Task[ArqRedis] = asyncio.create_task(create_pool(redis_connection_configuration.create_arq_settings()))
                try:
                    self.pool = await asyncio.shield(creation)
                except asyncio.CancelledError as cancellation:
                    async def close_created_pool() -> None:
                        self.pool = await creation
                        await self._close_owned_pool()

                    try:
                        await ResourceCleanup.close_all([close_created_pool])
                    except BaseException as cleanup_error:
                        raise cancellation from cleanup_error
                    raise
            return self.pool

    async def _close_owned_pool(self) -> None:
        if self.pool is not None:
            self.cleanup_pending = True
            await self.pool.aclose()
            self.pool = None
            self.cleanup_pending = False

    async def close(self) -> None:
        from app.core.resource_lifecycle import ResourceCleanup

        async with self.current_lock():
            await ResourceCleanup.close_all([self._close_owned_pool])


arq_producer_owner: ArqProducerOwner = ArqProducerOwner()


async def get_arq_pool() -> ArqRedis:
    return await arq_producer_owner.get()


async def enqueue_job(job_name: str, *args, **kwargs) -> None:
    if settings.TESTING:
        return
    pool = await get_arq_pool()
    await pool.enqueue_job(job_name, *args, **kwargs)


async def close_arq_pool() -> None:
    await arq_producer_owner.close()
