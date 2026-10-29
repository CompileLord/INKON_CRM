import asyncio
import os
import shutil
import sys
import uuid
from pathlib import Path
from datetime import date, datetime, timezone
from typing import Any, AsyncGenerator, Callable, Generator
from unittest.mock import Mock
from types import TracebackType
from urllib.parse import urlsplit

import pytest
import pytest_asyncio
import asyncpg
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from redis.asyncio import Redis
from redis.asyncio.client import Pipeline


class TestTargetConfiguration:
    @classmethod
    def validate(cls) -> tuple[str, str]:
        database_url: str | None = os.environ.get("TEST_DATABASE_URL")
        redis_url: str | None = os.environ.get("TEST_REDIS_URL")
        if not database_url or not redis_url:
            raise RuntimeError("Dedicated test database and Redis URLs are required")
        if os.environ.get("TESTING", "").lower() != "true" or os.environ.get("ENVIRONMENT") != "testing":
            raise RuntimeError("Test execution requires explicit testing environment settings")

        database = urlsplit(database_url)
        redis = urlsplit(redis_url)
        permitted_hosts: set[str] = {"localhost", "127.0.0.1", "::1"}
        database_is_dedicated = (
            database.scheme == "postgresql+asyncpg"
            and database.hostname in permitted_hosts
            and database.path == "/imkon_test_db"
            and database.port == 5432
        )
        redis_is_dedicated = (
            redis.scheme == "redis"
            and redis.hostname in permitted_hosts
            and redis.port == 6379
            and redis.path == "/15"
        )
        if (
            not database_is_dedicated
            or not redis_is_dedicated
            or database.query
            or database.fragment
            or redis.query
            or redis.fragment
        ):
            raise RuntimeError("Test targets must be dedicated loopback services and databases")
        return database_url, redis_url


class RedisNamespacePipeline:
    def __init__(self, pipeline: Pipeline, prefix: str) -> None:
        self._pipeline: Pipeline = pipeline
        self._prefix: str = prefix

    def delete(self, *keys: str) -> "RedisNamespacePipeline":
        self._pipeline.delete(*(f"{self._prefix}{key}" for key in keys))
        return self

    def expire(self, key: str, seconds: int) -> "RedisNamespacePipeline":
        self._pipeline.expire(f"{self._prefix}{key}", seconds)
        return self

    def get(self, key: str) -> "RedisNamespacePipeline":
        self._pipeline.get(f"{self._prefix}{key}")
        return self

    def incr(self, key: str, amount: int = 1) -> "RedisNamespacePipeline":
        self._pipeline.incr(f"{self._prefix}{key}", amount)
        return self

    def set(self, key: str, value: Any, **kwargs: Any) -> "RedisNamespacePipeline":
        self._pipeline.set(f"{self._prefix}{key}", value, **kwargs)
        return self

    def setex(self, key: str, seconds: int, value: Any) -> "RedisNamespacePipeline":
        self._pipeline.setex(f"{self._prefix}{key}", seconds, value)
        return self

    async def execute(self) -> list[Any]:
        return await self._pipeline.execute()


class RedisNamespaceClient:
    def __init__(self, client: Redis, prefix: str) -> None:
        self._client: Redis = client
        self._prefix: str = prefix

    async def delete(self, *keys: str) -> int:
        return await self._client.delete(*(f"{self._prefix}{key}" for key in keys))

    async def get(self, key: str) -> str | None:
        return await self._client.get(f"{self._prefix}{key}")

    async def ping(self) -> bool:
        return await self._client.ping()

    async def set(self, key: str, value: Any, **kwargs: Any) -> bool | None:
        return await self._client.set(f"{self._prefix}{key}", value, **kwargs)

    async def ttl(self, key: str) -> int:
        return await self._client.ttl(f"{self._prefix}{key}")

    async def scan(
        self,
        cursor: int = 0,
        match: str | None = None,
        count: int | None = None,
    ) -> tuple[int, list[str]]:
        namespaced_match = f"{self._prefix}{match or '*'}"
        next_cursor, keys = await self._client.scan(cursor=cursor, match=namespaced_match, count=count)
        return next_cursor, [key[len(self._prefix):] for key in keys]

    def pipeline(self, transaction: bool = True) -> RedisNamespacePipeline:
        return RedisNamespacePipeline(self._client.pipeline(transaction=transaction), self._prefix)

    async def eval(
        self,
        script: str,
        numkeys: int,
        *keys_and_args: Any,
    ) -> Any:
        if numkeys < 0 or numkeys > len(keys_and_args):
            raise ValueError("Invalid numkeys specified for Redis eval")
        declared_keys: list[str] = [
            f"{self._prefix}{str(key)}"
            for key in keys_and_args[:numkeys]
        ]
        args: list[Any] = list(keys_and_args[numkeys:])
        return await self._client.eval(script, numkeys, *(declared_keys + args))


class RedisNamespaceCleanup:
    def __init__(self, client: Redis, prefix: str) -> None:
        self.client: Redis = client
        self.prefix: str = prefix

    async def clean(self) -> None:
        keys = [key async for key in self.client.scan_iter(match=f"{self.prefix}*")]
        if keys:
            await self.client.delete(*keys)

    async def __aenter__(self) -> "RedisNamespaceCleanup":
        await self.clean()
        return self

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.clean()


if __name__ in sys.modules:
    sys.modules.setdefault("app.tests.conftest", sys.modules[__name__])


TEST_DATABASE_URL: str
TEST_REDIS_URL: str
TEST_DATABASE_URL, TEST_REDIS_URL = TestTargetConfiguration.validate()
TEST_WORKER_NAME: str | None = os.environ.get("PYTEST_XDIST_WORKER")
TEST_SCHEMA: str = f"test_{TEST_WORKER_NAME}" if TEST_WORKER_NAME else "public"
if TEST_WORKER_NAME:
    original_asyncpg_connect = asyncpg.connect

    async def connect_to_worker_schema(*args: Any, **kwargs: Any) -> asyncpg.Connection:
        database_name: str | None = kwargs.get("database")
        data_source_name: str | None = kwargs.get("dsn") or (args[0] if args else None)
        if data_source_name:
            database_name = urlsplit(data_source_name).path.removeprefix("/")
        if database_name == "imkon_test_db":
            server_settings: dict[str, str] = dict(kwargs.get("server_settings") or {})
            server_settings["search_path"] = TEST_SCHEMA
            server_settings.setdefault("application_name", TEST_SCHEMA)
            kwargs["server_settings"] = server_settings
        return await original_asyncpg_connect(*args, **kwargs)

    asyncpg.connect = connect_to_worker_schema
    os.environ["STORAGE_PATH"] = str(Path(os.environ.get("STORAGE_PATH", "storage")) / TEST_SCHEMA)
    shutil.rmtree(os.environ["STORAGE_PATH"], ignore_errors=True)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["REDIS_URL"] = TEST_REDIS_URL

TEST_REDIS_PREFIX: str = f"wp09:{os.getpid()}:{uuid.uuid4().hex}:"
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    pool_size=1 if TEST_WORKER_NAME else 5,
    max_overflow=5 if TEST_WORKER_NAME else 40,
    future=True,
)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

from app.core.config import settings
if TEST_WORKER_NAME:
    settings.DB_POOL_SIZE = 1
    settings.DB_OUTBOX_POOL_SIZE = 1
import app.core.redis as redis_module
from app.core.deps import get_db_session
from app.core.security import hash_password, create_access_token
from app.db.base import Base
from app.models.user import User, UserRole
from app.models.refresh_token import RefreshToken
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.document import Document
from app.models.payment import Payment
from app.models.charge import Charge, ChargeType, ChargeStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.allocation import Allocation
from app.models.accounting_period import AccountingPeriod, AccountingPeriodStatus
from app.models.notification_log import NotificationLog
from app.models.audit_log import AuditLog

raw_test_redis: Redis = redis_module.redis_client
test_redis_cleanup: RedisNamespaceCleanup = RedisNamespaceCleanup(raw_test_redis, TEST_REDIS_PREFIX)
redis_module.redis_client = RedisNamespaceClient(raw_test_redis, TEST_REDIS_PREFIX)
settings.REDIS_URL = TEST_REDIS_URL
settings.DATABASE_URL = TEST_DATABASE_URL

from app.main import app
from app.core.redis import redis_client
import app.db.session as db_session_module
import app.core.deps as deps_module
import app.workers.tasks as worker_tasks_module

db_session_module.AsyncSessionLocal = TestingSessionLocal
deps_module.AsyncSessionLocal = TestingSessionLocal
worker_tasks_module.AsyncSessionLocal = TestingSessionLocal


@pytest.fixture(autouse=True)
def test_password_bcrypt_rounds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PASSWORD_BCRYPT_ROUNDS", 4)


@pytest.fixture
def freeze_school_today(monkeypatch: pytest.MonkeyPatch) -> Callable[[date], None]:
    def freeze(school_day: date) -> None:
        monkeypatch.setattr("app.services.finance_service.get_dushanbe_today", Mock(return_value=school_day))

    return freeze


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db() -> AsyncGenerator[None, None]:
    from sqlalchemy import text
    async with test_engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE;'))
        await conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}";'))
        await conn.run_sync(Base.metadata.create_all)
    yield
    if TEST_WORKER_NAME:
        shutil.rmtree(os.environ["STORAGE_PATH"], ignore_errors=True)
        async with test_engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE;'))
    await test_engine.dispose()


@pytest_asyncio.fixture
async def dispose_schema_connections() -> AsyncGenerator[None, None]:
    try:
        yield
    finally:
        await test_engine.dispose()


@pytest.fixture(scope="session")
def shared_seed_state() -> dict[str, object]:
    return {}


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clean_database(request: pytest.FixtureRequest, shared_seed_state: dict[str, object]) -> None:
    if request.node.get_closest_marker("shared_seed") and shared_seed_state.get("ready"):
        return
    shared_seed_state.clear()
    statements: str = " ".join(f'DELETE FROM "{table.name}";' for table in reversed(Base.metadata.sorted_tables))
    async with test_engine.begin() as connection:
        await connection.exec_driver_sql(f"DO $$ BEGIN {statements} END $$")


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clean_owned_redis_keys() -> AsyncGenerator[None, None]:
    await test_redis_cleanup.clean()
    try:
        yield
    finally:
        await test_redis_cleanup.clean()


@pytest_asyncio.fixture(scope="function")
async def redis_namespace_scope() -> AsyncGenerator[RedisNamespaceCleanup, None]:
    try:
        yield test_redis_cleanup
    finally:
        await test_redis_cleanup.clean()


@pytest_asyncio.fixture(scope="function")
async def test_redis_connection() -> AsyncGenerator[Redis, None]:
    yield raw_test_redis


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        try:
            yield session
        finally:
            await session.rollback()


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        async with TestingSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db_session] = override_get_db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def test_admin() -> User:
    async with TestingSessionLocal() as session:
        admin = User(
            email="admin@example.com",
            password_hash=hash_password("admin_pass123"),
            first_name="Admin",
            last_name="Super",
            role=UserRole.SUPERADMIN,
            must_set_password=False
        )
        session.add(admin)
        await session.commit()
        return admin


@pytest_asyncio.fixture(scope="function")
async def test_mentor() -> User:
    async with TestingSessionLocal() as session:
        mentor = User(
            email="mentor@example.com",
            password_hash=hash_password("mentor_pass123"),
            first_name="Mentor",
            last_name="One",
            role=UserRole.MENTOR,
            must_set_password=False
        )
        session.add(mentor)
        await session.commit()
        return mentor


@pytest_asyncio.fixture(scope="function")
async def test_student() -> User:
    async with TestingSessionLocal() as session:
        student = User(
            email="student@example.com",
            password_hash=hash_password("student_pass123"),
            first_name="Student",
            last_name="One",
            role=UserRole.STUDENT,
            phone="+992900000888",
            must_set_password=False
        )
        session.add(student)
        await session.commit()
        return student


@pytest_asyncio.fixture(scope="function")
async def test_accountant() -> User:
    async with TestingSessionLocal() as session:
        accountant = User(
            email="accountant@example.com",
            password_hash=hash_password("accountant_pass123"),
            first_name="Accountant",
            last_name="One",
            role=UserRole.ACCOUNTANT,
            must_set_password=False
        )
        session.add(accountant)
        await session.commit()
        return accountant


@pytest.fixture(autouse=True)
def mock_email_service(monkeypatch):
    from app.services.email_service import EmailService
    async def mock_send_email(*args, **kwargs):
        pass
    monkeypatch.setattr(EmailService, "send_email", mock_send_email)
