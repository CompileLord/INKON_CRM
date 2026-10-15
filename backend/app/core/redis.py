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
    def from_url(cls, redis_url: str) -> RedisConnectionConfiguration:
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
redis_client: aioredis.Redis = redis_connection_configuration.create_client()


async def get_redis() -> aioredis.Redis:
    return redis_client


_arq_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    global _arq_pool
    if _arq_pool is None:
        from arq import create_pool
        _arq_pool = await create_pool(redis_connection_configuration.create_arq_settings())
    return _arq_pool


async def enqueue_job(job_name: str, *args, **kwargs) -> None:
    if settings.TESTING:
        return
    pool = await get_arq_pool()
    await pool.enqueue_job(job_name, *args, **kwargs)


async def close_arq_pool() -> None:
    global _arq_pool
    if _arq_pool is not None:
        await _arq_pool.aclose()
        _arq_pool = None

