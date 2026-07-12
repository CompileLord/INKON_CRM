import asyncio
from datetime import date, datetime, timezone
from typing import AsyncGenerator, Generator
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = "postgresql+asyncpg://linguist_user:linguist_pass_2024@localhost:5432/imkon_test_db"

test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool, future=True)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

import app.db.session as db_session_module
db_session_module.AsyncSessionLocal = TestingSessionLocal

from app.main import app
from app.core.config import settings
from app.core.deps import get_db_session
from app.core.security import hash_password, create_access_token
from app.core.redis import redis_client
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
from app.models.notification_log import NotificationLog
from app.models.audit_log import AuditLog





@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db() -> None:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await test_engine.dispose()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def clean_database():
    async with TestingSessionLocal() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()
        
@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    # Clear Redis rate limits
    await redis_client.flushdb()

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

