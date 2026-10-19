import json
import os
from typing import Any

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import verify_password
from app.core.temporary_passwords import TemporaryPasswordGenerator
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User, UserRole
from app.schemas.auth import TokenPair
from app.schemas.user import UserCreate, UserUpdate
from app.services.auth_service import AuthService
from app.services.email_service import EmailService
from app.services.outbox_service import OutboxPayloadEncryptor
from app.services.user_service import UserService
from app.workers.outbox import OutboxWorkerManager


def build_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(os.environ["TEST_DATABASE_URL"], pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


async def create_student(db_session: AsyncSession, email: str = "fresh.student@example.com") -> User:
    created_user: User = await UserService(db_session).create_user(
        UserCreate(email=email, first_name="Farrukh", last_name="Karimov", role=UserRole.STUDENT)
    )
    await db_session.commit()
    return created_user


async def load_credentials_events(db_session: AsyncSession, email: str) -> list[OutboxEvent]:
    result = await db_session.execute(
        select(OutboxEvent)
        .where(
            OutboxEvent.kind == OutboxEventKind.CREDENTIALS_EMAIL,
            OutboxEvent.recipient_email == email,
        )
        .order_by(OutboxEvent.id)
    )
    return list(result.scalars().all())


def decrypt_temporary_password(event: OutboxEvent) -> str:
    assert event.encrypted_payload is not None
    decrypted: dict[str, str] = json.loads(OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload))
    return decrypted["temporary_password"]


class TestTemporaryPasswordGenerator:
    def test_generated_password_is_exactly_six_digits_over_many_samples(self) -> None:
        generator = TemporaryPasswordGenerator()
        for _ in range(2000):
            password: str = generator.generate()
            assert len(password) == 6
            assert password.isascii() and password.isdigit()

    def test_generator_draws_from_secrets_and_zero_pads(self, monkeypatch: pytest.MonkeyPatch) -> None:
        requested_bounds: list[int] = []

        def fake_randbelow(upper_bound: int) -> int:
            requested_bounds.append(upper_bound)
            return 42

        monkeypatch.setattr("app.core.temporary_passwords.secrets.randbelow", fake_randbelow)

        assert TemporaryPasswordGenerator().generate() == "000042"
        assert requested_bounds == [1_000_000]


@pytest.mark.asyncio
async def test_create_user_stores_hash_and_enqueues_credentials_without_verification_challenge(
    db_session: AsyncSession,
) -> None:
    user: User = await create_student(db_session)

    assert user.password_hash
    assert user.must_set_password is True
    events: list[OutboxEvent] = await load_credentials_events(db_session, user.email)
    assert len(events) == 1
    assert events[0].status == OutboxEventStatus.PENDING
    assert await redis_client.get(f"auth:code:{user.email}") is None
    verification_events = await db_session.execute(
        select(OutboxEvent).where(OutboxEvent.kind == OutboxEventKind.VERIFICATION_EMAIL)
    )
    assert verification_events.scalars().all() == []


@pytest.mark.asyncio
async def test_emailed_password_logs_in_with_must_set_password_scope(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    event: OutboxEvent = (await load_credentials_events(db_session, user.email))[0]
    temporary_password: str = decrypt_temporary_password(event)

    token_pair: TokenPair = await AuthService(db_session).login(user.email, temporary_password)

    assert token_pair.must_set_password is True
    assert len(temporary_password) == 6 and temporary_password.isdigit()

    claims: dict[str, Any] = jwt.decode(token_pair.access_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    assert claims["scope"] == "must_set_password"


@pytest.mark.asyncio
async def test_plaintext_password_never_persisted(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    event: OutboxEvent = (await load_credentials_events(db_session, user.email))[0]
    temporary_password: str = decrypt_temporary_password(event)

    outbox_columns: list[str] = [
        str(getattr(event, column.name)) for column in OutboxEvent.__table__.columns
    ]
    user_columns: list[str] = [str(getattr(user, column.name)) for column in User.__table__.columns]
    assert all(temporary_password not in value for value in outbox_columns + user_columns)
    assert verify_password(temporary_password, user.password_hash)


@pytest.mark.asyncio
async def test_set_password_invalidates_temporary_password(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    temporary_password: str = decrypt_temporary_password((await load_credentials_events(db_session, user.email))[0])
    auth_service = AuthService(db_session)

    await auth_service.set_password(user.id, "my-own-pass-42")
    await db_session.commit()

    with pytest.raises(HTTPException) as caught:
        await auth_service.login(user.email, temporary_password)
    assert caught.value.status_code == 401
    final_pair: TokenPair = await auth_service.login(user.email, "my-own-pass-42")
    assert final_pair.must_set_password is False


@pytest.mark.asyncio
async def test_resend_replaces_temporary_password(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    first_password: str = decrypt_temporary_password((await load_credentials_events(db_session, user.email))[0])
    auth_service = AuthService(db_session)
    initial_auth_version: int = user.auth_version

    await auth_service.resend_code(user.email)
    await db_session.commit()

    events: list[OutboxEvent] = await load_credentials_events(db_session, user.email)
    assert len(events) == 2
    second_password: str = decrypt_temporary_password(events[1])
    assert second_password != first_password
    with pytest.raises(HTTPException):
        await auth_service.login(user.email, first_password)
    assert (await auth_service.login(user.email, second_password)).must_set_password is True
    await db_session.refresh(user)
    assert user.auth_version > initial_auth_version


@pytest.mark.asyncio
async def test_resend_rejects_user_with_password_already_set(
    db_session: AsyncSession, test_student: User
) -> None:
    with pytest.raises(HTTPException) as caught:
        await AuthService(db_session).resend_code(test_student.email)
    assert caught.value.status_code == 400
    assert await load_credentials_events(db_session, test_student.email) == []


@pytest.mark.asyncio
async def test_email_change_issues_new_credentials_and_invalidates_old_password(
    db_session: AsyncSession,
) -> None:
    user: User = await create_student(db_session)
    old_password: str = decrypt_temporary_password((await load_credentials_events(db_session, user.email))[0])
    await AuthService(db_session).set_password(user.id, "my-own-pass-42")
    await db_session.commit()
    auth_version_before: int = user.auth_version

    updated_user: User = await UserService(db_session).update_user(
        user.id, UserUpdate(email="moved.student@example.com")
    )
    await db_session.commit()

    assert updated_user.email == "moved.student@example.com"
    assert updated_user.must_set_password is True
    assert updated_user.auth_version > auth_version_before
    new_events: list[OutboxEvent] = await load_credentials_events(db_session, "moved.student@example.com")
    assert len(new_events) == 1
    new_password: str = decrypt_temporary_password(new_events[0])
    auth_service = AuthService(db_session)
    for rejected_password in (old_password, "my-own-pass-42"):
        with pytest.raises(HTTPException):
            await auth_service.login("moved.student@example.com", rejected_password)
    assert (await auth_service.login("moved.student@example.com", new_password)).must_set_password is True


class RecordingEmailService(EmailService):
    def __init__(self) -> None:
        self.sent_messages: list[dict[str, str]] = []

    async def send_email(
        self, to_email: str, subject: str, body: str, force_transport: bool = False, **_: object
    ) -> None:
        self.sent_messages.append({"to": to_email, "subject": subject, "body": body})


@pytest.mark.asyncio
async def test_worker_sends_login_and_password_then_purges_payload(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    event: OutboxEvent = (await load_credentials_events(db_session, user.email))[0]
    temporary_password: str = decrypt_temporary_password(event)
    recorder = RecordingEmailService()
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=recorder)

    await worker.run_once(build_session_factory())

    assert len(recorder.sent_messages) == 1
    message: dict[str, str] = recorder.sent_messages[0]
    assert message["to"] == user.email
    assert f"Логин: {user.email}" in message["body"]
    assert f"Пароль: {temporary_password}" in message["body"]
    assert "Farrukh" in message["body"]
    assert "задайте новый пароль" in message["body"]
    await db_session.refresh(event)
    assert event.status == OutboxEventStatus.DELIVERED
    assert event.encrypted_payload is None


@pytest.mark.asyncio
async def test_newer_credentials_supersede_older_event(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    await AuthService(db_session).resend_code(user.email)
    await db_session.commit()
    older_event, newer_event = await load_credentials_events(db_session, user.email)
    newer_password: str = decrypt_temporary_password(newer_event)
    recorder = RecordingEmailService()
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=recorder)

    await worker.run_once(build_session_factory())

    await db_session.refresh(older_event)
    await db_session.refresh(newer_event)
    assert older_event.status == OutboxEventStatus.EXPIRED
    assert older_event.last_error == "credentials_superseded"
    assert newer_event.status == OutboxEventStatus.DELIVERED
    assert [message["body"] for message in recorder.sent_messages if newer_password in message["body"]]
    assert len(recorder.sent_messages) == 1


@pytest.mark.asyncio
async def test_worker_drops_credentials_after_user_chose_own_password(db_session: AsyncSession) -> None:
    user: User = await create_student(db_session)
    event: OutboxEvent = (await load_credentials_events(db_session, user.email))[0]
    await AuthService(db_session).set_password(user.id, "my-own-pass-42")
    await db_session.commit()
    recorder = RecordingEmailService()
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=recorder)

    await worker.run_once(build_session_factory())

    await db_session.refresh(event)
    assert recorder.sent_messages == []
    assert event.status == OutboxEventStatus.EXPIRED
    assert event.last_error == "user_state_invalid_or_password_already_set"
