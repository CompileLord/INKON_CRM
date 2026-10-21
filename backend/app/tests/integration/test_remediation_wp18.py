import os
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.schemas.user import UserCreate
from app.services.email_service import EmailService
from app.services.outbox_service import OutboxPayloadEncryptor, OutboxService
from app.services.user_service import UserService
from app.workers.outbox import OutboxWorkerManager

ORIGINAL_SEND_EMAIL = EmailService.send_email


def _make_test_session_factory() -> async_sessionmaker[AsyncSession]:
    db_url = os.environ["TEST_DATABASE_URL"]
    engine = create_async_engine(db_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_enqueue_inserts_pending_row_in_transaction(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    svc = OutboxService(repo, settings.JWT_SECRET_KEY)

    event = await svc.enqueue_verification_email(
        recipient_email="user@example.com",
        code="123456",
        correlation_key="verification:user@example.com",
    )

    assert event.id is not None
    assert event.status == OutboxEventStatus.PENDING
    assert event.kind == OutboxEventKind.VERIFICATION_EMAIL
    assert event.encrypted_payload is not None
    assert "123456" not in (event.encrypted_payload or "")
    assert event.expires_at is not None
    assert event.attempt_count == 0


@pytest.mark.asyncio
async def test_payload_authenticated_encryption_roundtrip() -> None:
    key = "test-master-key-32-bytes-minimum!"
    plaintext = "654321"
    encryptor = OutboxPayloadEncryptor(key)
    encrypted = encryptor.encrypt(plaintext)

    assert plaintext not in encrypted
    assert "654321" not in encrypted

    decrypted = encryptor.decrypt(encrypted)
    assert decrypted == plaintext


@pytest.mark.asyncio
async def test_payload_wrong_key_or_tampering_raises() -> None:
    from cryptography.exceptions import InvalidTag
    import base64

    encryptor_correct = OutboxPayloadEncryptor("correct-key")
    encryptor_wrong = OutboxPayloadEncryptor("wrong-key")

    encrypted = encryptor_correct.encrypt("123456")
    with pytest.raises(InvalidTag):
        encryptor_wrong.decrypt(encrypted)

    raw = bytearray(base64.b64decode(encrypted.encode("ascii")))
    raw[-1] ^= 0x01
    tampered = base64.b64encode(raw).decode("ascii")
    with pytest.raises(InvalidTag):
        encryptor_correct.decrypt(tampered)


@pytest.mark.asyncio
async def test_user_service_create_user_rollback_no_mail_sent(db_session: AsyncSession) -> None:
    sent_emails: list[str] = []

    async def capture_send(self_: Any, to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        sent_emails.append(to_email)

    test_email = f"rollback_{int(time_seconds := datetime.now().timestamp()*1000)}@example.com"
    with patch.object(EmailService, "send_email", new=capture_send):
        try:
            async with db_session.begin_nested():
                user_service = UserService(db_session)
                user_create = UserCreate(
                    email=test_email,
                    first_name="Rollback",
                    last_name="Tester",
                    role=UserRole.STUDENT,
                    phone="+992900000999",
                )
                await user_service.create_user(user_create)
                raise RuntimeError("simulated business transaction failure")
        except RuntimeError:
            pass

    assert len(sent_emails) == 0

    result_user = await db_session.execute(select(User).where(User.email == test_email))
    assert result_user.scalars().first() is None

    result_outbox = await db_session.execute(
        select(OutboxEvent).where(OutboxEvent.recipient_email == test_email)
    )
    assert result_outbox.scalars().first() is None


@pytest.mark.asyncio
async def test_claim_pending_batch_atomic(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    svc = OutboxService(repo, settings.JWT_SECRET_KEY)

    for i in range(3):
        await svc.enqueue_verification_email(
            recipient_email=f"batch{i}@example.com",
            code=str(100000 + i),
        )
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed = await repo.claim_pending_batch(
        lease_owner="test-worker-1",
        lease_duration_seconds=60,
        batch_size=10,
        now=now,
    )
    await db_session.commit()

    assert len(claimed) == 3
    for event in claimed:
        assert event.status == OutboxEventStatus.CLAIMED
        assert event.lease_owner == "test-worker-1"
        assert event.lease_expires_at is not None
        assert event.attempt_count == 0


@pytest.mark.asyncio
async def test_claim_does_not_return_expired_events(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    past = datetime.now(timezone.utc) - timedelta(seconds=1)
    event = OutboxEvent(
        kind=OutboxEventKind.VERIFICATION_EMAIL,
        status=OutboxEventStatus.PENDING,
        recipient_email="expired@example.com",
        subject="Test",
        encrypted_payload=encryptor.encrypt("123456"),
        max_attempts=5,
        next_attempt_at=past,
        expires_at=past,
    )
    db_session.add(event)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed = await repo.claim_pending_batch(
        lease_owner="test-worker",
        lease_duration_seconds=60,
        batch_size=10,
        now=now,
    )
    await db_session.commit()

    assert len(claimed) == 0


@pytest.mark.asyncio
async def test_claim_does_not_return_max_attempts_exhausted(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    event = OutboxEvent(
        kind=OutboxEventKind.VERIFICATION_EMAIL,
        status=OutboxEventStatus.PENDING,
        recipient_email="maxed@example.com",
        subject="Test",
        encrypted_payload=encryptor.encrypt("123456"),
        attempt_count=5,
        max_attempts=5,
        next_attempt_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    db_session.add(event)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed = await repo.claim_pending_batch(
        lease_owner="test-worker",
        lease_duration_seconds=60,
        batch_size=10,
        now=now,
    )
    await db_session.commit()

    assert len(claimed) == 0


@pytest.mark.asyncio
async def test_stale_lease_released_and_reclaimed(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    svc = OutboxService(repo, settings.JWT_SECRET_KEY)

    await svc.enqueue_verification_email(
        recipient_email="stale@example.com",
        code="333444",
    )
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed_first = await repo.claim_pending_batch(
        lease_owner="worker-stale",
        lease_duration_seconds=1,
        batch_size=10,
        now=now,
    )
    await db_session.commit()
    assert len(claimed_first) == 1

    future = now + timedelta(seconds=10)
    released = await repo.release_stale_leases(future)
    await db_session.commit()
    assert released >= 1

    claimed_second = await repo.claim_pending_batch(
        lease_owner="worker-fresh",
        lease_duration_seconds=60,
        batch_size=10,
        now=future,
    )
    await db_session.commit()
    assert len(claimed_second) == 1


@pytest.mark.asyncio
async def test_stale_lease_transitions_to_failed_on_max_attempts(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    event = OutboxEvent(
        kind=OutboxEventKind.VERIFICATION_EMAIL,
        status=OutboxEventStatus.CLAIMED,
        recipient_email="max-stale@example.com",
        subject="Test",
        encrypted_payload=encryptor.encrypt("123456"),
        attempt_count=5,
        max_attempts=5,
        lease_owner="worker-crashed",
        lease_expires_at=past,
    )
    db_session.add(event)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    count = await repo.release_stale_leases(now)
    await db_session.commit()

    assert count >= 1
    result = await db_session.execute(select(OutboxEvent).where(OutboxEvent.id == event.id))
    updated = result.scalar_one()
    assert updated.status == OutboxEventStatus.FAILED
    assert updated.encrypted_payload is None
    assert updated.lease_owner is None


@pytest.mark.asyncio
async def test_lease_fencing_stale_owner_cannot_settle(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    svc = OutboxService(repo, settings.JWT_SECRET_KEY)

    event = await svc.enqueue_verification_email(
        recipient_email="fenced@example.com",
        code="111222",
    )
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed = await repo.claim_pending_batch(
        lease_owner="worker-A",
        lease_duration_seconds=2,
        batch_size=10,
        now=now,
    )
    await db_session.commit()
    assert len(claimed) == 1

    future = now + timedelta(seconds=10)
    await repo.release_stale_leases(future)
    await db_session.commit()

    claimed_by_b = await repo.claim_pending_batch(
        lease_owner="worker-B",
        lease_duration_seconds=60,
        batch_size=10,
        now=future,
    )
    await db_session.commit()
    assert len(claimed_by_b) == 1

    settled_by_stale_owner_a = await repo.mark_delivered(event.id, "worker-A", future)
    await db_session.commit()
    assert not settled_by_stale_owner_a

    settled_by_valid_owner_b = await repo.mark_delivered(event.id, "worker-B", future)
    await db_session.commit()
    assert settled_by_valid_owner_b


@pytest.mark.asyncio
async def test_worker_skips_send_when_lease_expired_in_queue() -> None:
    session_factory = _make_test_session_factory()
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    past = datetime.now(timezone.utc) - timedelta(seconds=2)
    async with session_factory() as session:
        event = OutboxEvent(
            kind=OutboxEventKind.VERIFICATION_EMAIL,
            status=OutboxEventStatus.CLAIMED,
            recipient_email="queue-expired@example.com",
            subject="Test",
            encrypted_payload=encryptor.encrypt("123456"),
            attempt_count=1,
            max_attempts=5,
            lease_owner="worker-slow",
            lease_expires_at=past,
        )
        session.add(event)
        await session.commit()
        event_id = event.id

    sent_emails: list[str] = []

    async def track_send(self_: Any, to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        sent_emails.append(to_email)

    worker = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=settings.JWT_SECRET_KEY,
        min_lease_remaining_seconds=5.0,
    )

    with patch.object(EmailService, "send_email", new=track_send):
        async with session_factory() as session:
            res = await session.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
            ev = res.scalar_one()
            result = await worker.process_single_event(ev, "worker-slow", session_factory)

    assert not result
    assert len(sent_emails) == 0


@pytest.mark.asyncio
async def test_mark_delivered_purges_payload_and_sets_status(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    svc = OutboxService(repo, settings.JWT_SECRET_KEY)

    event = await svc.enqueue_verification_email(
        recipient_email="deliver@example.com",
        code="555666",
    )
    await db_session.commit()

    now = datetime.now(timezone.utc)
    claimed = await repo.claim_pending_batch(
        lease_owner="worker-deliv",
        lease_duration_seconds=60,
        batch_size=10,
        now=now,
    )
    await db_session.commit()
    assert len(claimed) == 1

    success = await repo.mark_delivered(event.id, "worker-deliv", now)
    await db_session.commit()
    assert success

    result = await db_session.execute(select(OutboxEvent).where(OutboxEvent.id == event.id))
    updated = result.scalar_one()
    assert updated.status == OutboxEventStatus.DELIVERED
    assert updated.encrypted_payload is None
    assert updated.delivered_at is not None


@pytest.mark.asyncio
async def test_mark_failed_terminal_after_max_attempts(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    event = OutboxEvent(
        kind=OutboxEventKind.VERIFICATION_EMAIL,
        status=OutboxEventStatus.CLAIMED,
        recipient_email="terminal@example.com",
        subject="Test",
        encrypted_payload=encryptor.encrypt("123456"),
        attempt_count=5,
        max_attempts=5,
        lease_owner="worker-x",
        lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
        next_attempt_at=datetime.now(timezone.utc),
    )
    db_session.add(event)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    success = await repo.mark_failed(
        event_id=event.id,
        lease_owner="worker-x",
        error_summary="smtp_timeout",
        next_attempt_at=None,
        now=now,
    )
    await db_session.commit()
    assert success

    result = await db_session.execute(select(OutboxEvent).where(OutboxEvent.id == event.id))
    updated = result.scalar_one()
    assert updated.status == OutboxEventStatus.FAILED
    assert updated.lease_owner is None
    assert updated.last_error == "smtp_timeout"
    assert updated.encrypted_payload is None


@pytest.mark.asyncio
async def test_mark_failed_pending_before_max_attempts(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    encryptor = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY)

    event = OutboxEvent(
        kind=OutboxEventKind.VERIFICATION_EMAIL,
        status=OutboxEventStatus.CLAIMED,
        recipient_email="retry@example.com",
        subject="Test",
        encrypted_payload=encryptor.encrypt("123456"),
        attempt_count=2,
        max_attempts=5,
        lease_owner="worker-y",
        lease_expires_at=datetime.now(timezone.utc) + timedelta(seconds=60),
        next_attempt_at=datetime.now(timezone.utc),
    )
    db_session.add(event)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    next_at = now + timedelta(seconds=30)
    success = await repo.mark_failed(
        event_id=event.id,
        lease_owner="worker-y",
        error_summary="connection_refused",
        next_attempt_at=next_at,
        now=now,
    )
    await db_session.commit()
    assert success

    result = await db_session.execute(select(OutboxEvent).where(OutboxEvent.id == event.id))
    updated = result.scalar_one()
    assert updated.status == OutboxEventStatus.PENDING
    assert updated.lease_owner is None
    assert updated.next_attempt_at is not None
    assert updated.encrypted_payload is not None


@pytest.mark.asyncio
async def test_corrupt_or_missing_payload_recovers_to_terminal_failed() -> None:
    session_factory = _make_test_session_factory()
    now = datetime.now(timezone.utc)

    async with session_factory() as session:
        event = OutboxEvent(
            kind=OutboxEventKind.VERIFICATION_EMAIL,
            status=OutboxEventStatus.PENDING,
            recipient_email="corrupt@example.com",
            subject="Test Corrupt",
            encrypted_payload="not-valid-base64-or-ciphertext!@#$",
            attempt_count=0,
            max_attempts=5,
            next_attempt_at=now,
        )
        session.add(event)
        await session.commit()
        event_id = event.id

    worker = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=settings.JWT_SECRET_KEY,
    )
    processed = await worker.run_once(session_factory)
    assert processed >= 1

    async with session_factory() as session:
        res = await session.execute(select(OutboxEvent).where(OutboxEvent.id == event_id))
        updated = res.scalar_one()
        assert updated.status == OutboxEventStatus.FAILED
        assert updated.encrypted_payload is None
        assert updated.last_error == "payload_decryption_failed"


