from app.core.login_identifier import LoginIdentifierParser
import asyncio
import importlib.util
import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.redis import redis_client
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.auth_service import AuthService
from app.services.auth_composition import AuthServiceComposition
from app.services.email_service import EmailService
from app.services.outbox_service import OutboxService
from app.workers.outbox import OutboxWorkerManager, run_outbox_worker_once

ORIGINAL_SEND_EMAIL = EmailService.send_email


def _make_test_session_factory() -> async_sessionmaker[AsyncSession]:
    db_url = os.environ["TEST_DATABASE_URL"]
    engine = create_async_engine(db_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_password_reset_mail_path(db_session: AsyncSession) -> None:
    user = User(
        email="reset-path@example.com",
        first_name="Reset",
        last_name="Tester",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(user)
    await db_session.commit()

    auth_svc: AuthService = AuthServiceComposition.create(db_session)
    await auth_svc.password_reset_request(LoginIdentifierParser.from_email(user.email))
    await db_session.commit()

    session_factory = _make_test_session_factory()
    delivered_bodies: list[str] = []

    async def capture_send(to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        delivered_bodies.append(body)

    email_svc = EmailService()
    email_svc.send_email = capture_send  # type: ignore[method-assign]

    worker = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=settings.JWT_SECRET_KEY,
        email_service=email_svc,
    )
    processed = await worker.run_once(session_factory)
    assert processed >= 1
    assert len(delivered_bodies) == 1
    assert "Код для сброса пароля:" in delivered_bodies[0]

    async with session_factory() as session:
        res = await session.execute(
            select(OutboxEvent).where(OutboxEvent.recipient_email == "reset-path@example.com")
        )
        ev = res.scalar_one()
        assert ev.status == OutboxEventStatus.DELIVERED
        assert ev.encrypted_payload is None


@pytest.mark.asyncio
async def test_worker_once_delivers_and_purges_payload(db_session: AsyncSession) -> None:
    user = User(
        email="worker@example.com",
        first_name="Worker",
        last_name="Test",
        role=UserRole.STUDENT,
        must_set_password=True,
    )
    db_session.add(user)
    await db_session.commit()

    auth_svc: AuthService = AuthServiceComposition.create(db_session)
    await auth_svc.generate_verification_code(user.email)
    await db_session.commit()

    session_factory = _make_test_session_factory()
    delivered_calls: list[dict[str, str]] = []

    async def capture_send(to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        delivered_calls.append({"to": to_email, "subject": subject, "body": body})

    email_service = EmailService()
    email_service.send_email = capture_send  # type: ignore[method-assign]

    processed = await run_outbox_worker_once(
        session_factory,
        settings.JWT_SECRET_KEY,
        email_service=email_service,
    )

    assert processed >= 1
    assert any(c["to"] == "worker@example.com" for c in delivered_calls)

    async with session_factory() as verify_session:
        result = await verify_session.execute(
            select(OutboxEvent).where(OutboxEvent.recipient_email == "worker@example.com")
        )
        updated = result.scalar_one()
        assert updated.status == OutboxEventStatus.DELIVERED
        assert updated.encrypted_payload is None


@pytest.mark.asyncio
async def test_worker_does_not_send_superseded_or_expired_code(db_session: AsyncSession) -> None:
    user = User(
        email="superseded@example.com",
        first_name="Super",
        last_name="Seded",
        role=UserRole.STUDENT,
        must_set_password=True,
    )
    db_session.add(user)
    await db_session.commit()

    auth_svc: AuthService = AuthServiceComposition.create(db_session)
    await auth_svc.generate_verification_code(user.email)
    await db_session.commit()

    await redis_client.delete(f"auth:code:{user.email}")

    session_factory = _make_test_session_factory()
    delivered: list[str] = []

    async def capture_send(to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        delivered.append(to_email)

    email_service = EmailService()
    email_service.send_email = capture_send  # type: ignore[method-assign]

    await run_outbox_worker_once(
        session_factory,
        settings.JWT_SECRET_KEY,
        email_service=email_service,
    )

    assert "superseded@example.com" not in delivered

    async with session_factory() as verify_session:
        result = await verify_session.execute(
            select(OutboxEvent).where(OutboxEvent.recipient_email == "superseded@example.com")
        )
        updated = result.scalar_one()
        assert updated.status == OutboxEventStatus.EXPIRED
        assert updated.encrypted_payload is None


@pytest.mark.asyncio
async def test_concurrent_workers_claim_disjoint_sets() -> None:
    db_url = os.environ["TEST_DATABASE_URL"]
    engine_a = create_async_engine(db_url, pool_pre_ping=True)
    engine_b = create_async_engine(db_url, pool_pre_ping=True)
    factory_a = async_sessionmaker(engine_a, expire_on_commit=False)
    factory_b = async_sessionmaker(engine_b, expire_on_commit=False)

    async with factory_a() as session_a:
        repo_a = SQLAlchemyOutboxRepository(session_a)
        svc_a = OutboxService(repo_a, settings.JWT_SECRET_KEY)
        for i in range(4):
            await svc_a.enqueue_verification_email(
                recipient_email=f"concurrent{i}@example.com",
                code=str(200000 + i),
            )
        await session_a.commit()

    now = datetime.now(timezone.utc)

    async def claim_from(factory: async_sessionmaker[AsyncSession], owner: str) -> list[int]:
        async with factory() as session:
            repo = SQLAlchemyOutboxRepository(session)
            claimed = await repo.claim_pending_batch(
                lease_owner=owner,
                lease_duration_seconds=60,
                batch_size=10,
                now=now,
            )
            await session.commit()
            return [e.id for e in claimed]

    ids_a, ids_b = await asyncio.gather(
        claim_from(factory_a, "worker-concurrent-A"),
        claim_from(factory_b, "worker-concurrent-B"),
    )

    overlap = set(ids_a) & set(ids_b)
    assert len(overlap) == 0
    assert len(ids_a) + len(ids_b) == 4

    await engine_a.dispose()
    await engine_b.dispose()


@pytest.mark.asyncio
async def test_no_db_checkout_held_during_smtp_send(db_session: AsyncSession) -> None:
    user = User(
        email="smtp-stall@example.com",
        first_name="Stall",
        last_name="Tester",
        role=UserRole.STUDENT,
        must_set_password=True,
    )
    db_session.add(user)
    await db_session.commit()

    auth_svc: AuthService = AuthServiceComposition.create(db_session)
    await auth_svc.generate_verification_code(user.email)
    await db_session.commit()

    db_url = os.environ["TEST_DATABASE_URL"]
    instrumented_engine = create_async_engine(db_url, pool_pre_ping=True, pool_size=5, max_overflow=5)
    instrumented_factory = async_sessionmaker(instrumented_engine, expire_on_commit=False)

    checkouts_during_smtp: list[int] = []

    async def slow_send_email(to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        checked_out = instrumented_engine.sync_engine.pool.checkedout()
        checkouts_during_smtp.append(checked_out)
        await asyncio.sleep(0.1)

    email_service = EmailService()
    email_service.send_email = slow_send_email  # type: ignore[method-assign]

    worker = OutboxWorkerManager(
        database_url=db_url,
        payload_master_key=settings.JWT_SECRET_KEY,
        email_service=email_service,
    )

    processed = await worker.run_once(instrumented_factory)

    assert processed >= 1
    assert len(checkouts_during_smtp) >= 1
    assert all(c == 0 for c in checkouts_during_smtp)

    await instrumented_engine.dispose()


@pytest.mark.asyncio
async def test_worker_lifecycle_startup_and_bounded_shutdown() -> None:
    db_url = os.environ["TEST_DATABASE_URL"]
    worker = OutboxWorkerManager(
        database_url=db_url,
        payload_master_key=settings.JWT_SECRET_KEY,
        poll_interval_seconds=0.1,
    )
    await worker.start()
    assert worker._worker_task is not None
    assert not worker._worker_task.done()

    await asyncio.sleep(0.15)

    await worker.stop()
    assert worker._worker_task is None
    assert worker._engine is None


@pytest.mark.asyncio
async def test_migration_upgrade_downgrade_safety() -> None:
    migration_path = Path(__file__).parent.parent.parent.parent / "alembic" / "versions" / "rwp18_outbox.py"
    assert migration_path.exists()

    spec = importlib.util.spec_from_file_location("rwp18_outbox", migration_path)
    assert spec is not None and spec.loader is not None
    migration_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration_module)  # type: ignore[arg-type]

    assert hasattr(migration_module, "upgrade")
    assert hasattr(migration_module, "downgrade")
    assert migration_module.revision == "b3c4d5e6f7a8"
    assert migration_module.down_revision == "fa17c2e9b041"


@pytest.mark.asyncio
async def test_stale_owner_cannot_expire_completed_delivery(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    event = await OutboxService(repo, settings.JWT_SECRET_KEY).enqueue_verification_email("root-expire@example.com", "123456")
    await db_session.commit()
    now = datetime.now(timezone.utc)
    await repo.claim_pending_batch("root-owner", 60, 1, now)
    await db_session.commit()
    assert await repo.mark_delivered(event.id, "root-owner", now)
    await db_session.commit()
    changed = await repo.mark_expired(event.id, "root-owner", "stale_snapshot", now)
    await db_session.commit()
    assert not changed
    await db_session.refresh(event)
    assert event.status == OutboxEventStatus.DELIVERED


@pytest.mark.asyncio
async def test_expired_lease_cannot_settle_expiry(db_session: AsyncSession) -> None:
    repo = SQLAlchemyOutboxRepository(db_session)
    event = await OutboxService(repo, settings.JWT_SECRET_KEY).enqueue_verification_email("root-dead-lease@example.com", "123456")
    await db_session.commit()
    now = datetime.now(timezone.utc)
    await repo.claim_pending_batch("root-owner", 1, 1, now)
    await db_session.commit()
    assert not await repo.mark_expired(event.id, "root-owner", "stale_owner", now + timedelta(seconds=2))


@pytest.mark.asyncio
async def test_worker_logs_do_not_include_raw_sensitive_exception(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
    worker._stop_event = asyncio.Event()

    async def broken_iteration() -> int:
        assert worker._stop_event is not None
        worker._stop_event.set()
        raise RuntimeError("root-sensitive-smtp-credential")

    monkeypatch.setattr(worker, "run_once", broken_iteration)
    with caplog.at_level(logging.ERROR, logger="app.workers.outbox"):
        await worker.run_loop()
    assert "root-sensitive-smtp-credential" not in caplog.text
    assert "RuntimeError" in caplog.text


@pytest.mark.asyncio
async def test_worker_stop_waits_for_inflight_smtp_thread(db_session: AsyncSession, test_student: User, monkeypatch: pytest.MonkeyPatch) -> None:
    test_student.must_set_password = True
    db_session.add(test_student)
    await db_session.commit()
    await AuthServiceComposition.create(db_session).generate_verification_code(test_student.email)
    await db_session.commit()
    started = threading.Event()
    finished = threading.Event()

    def synthetic_smtp(to_email: str, subject: str, body: str, *_: object) -> None:
        started.set()
        time.sleep(0.4)
        finished.set()

    email = EmailService()
    monkeypatch.setattr(email, "send_email", ORIGINAL_SEND_EMAIL.__get__(email, EmailService))
    monkeypatch.setattr(email, "_send_smtp", synthetic_smtp)
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=email)
    try:
        await worker.start()
        assert await asyncio.to_thread(started.wait, 2)
        await worker.stop()
        assert finished.is_set()
    finally:
        await worker.stop()
        await asyncio.to_thread(finished.wait, 2)



@pytest.mark.asyncio
async def test_worker_stop_timeout_does_not_cancel_transport_wrapper(db_session: AsyncSession, test_student: User, monkeypatch: pytest.MonkeyPatch) -> None:
    test_student.must_set_password = True
    db_session.add(test_student)
    await db_session.commit()
    await AuthServiceComposition.create(db_session).generate_verification_code(test_student.email)
    await db_session.commit()
    started = threading.Event()
    finished = threading.Event()
    original_wait_for = asyncio.wait_for

    async def accelerated_shutdown_wait(awaitable: Any, timeout: float | None) -> Any:
        return await original_wait_for(awaitable, timeout=0.05 if timeout == 15.0 else timeout)

    def synthetic_smtp(to_email: str, subject: str, body: str, *_: object) -> None:
        started.set()
        time.sleep(0.4)
        finished.set()

    email = EmailService()
    monkeypatch.setattr(email, "send_email", ORIGINAL_SEND_EMAIL.__get__(email, EmailService))
    monkeypatch.setattr(email, "_send_smtp", synthetic_smtp)
    monkeypatch.setattr(asyncio, "wait_for", accelerated_shutdown_wait)
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=email)
    try:
        await worker.start()
        assert await asyncio.to_thread(started.wait, 2)
        await worker.stop()
        assert finished.is_set(), "Shutdown returned while the SMTP transport thread remained active"
    finally:
        await worker.stop()
        await asyncio.to_thread(finished.wait, 2)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("kind", "is_deleted", "must_set_password", "expected_reason"),
    [
        (OutboxEventKind.VERIFICATION_EMAIL, True, True, "user_state_invalid_or_password_already_set"),
        (OutboxEventKind.PASSWORD_RESET_EMAIL, True, True, "user_not_found_or_deleted"),
        (OutboxEventKind.VERIFICATION_EMAIL, False, False, "user_state_invalid_or_password_already_set"),
    ],
)
async def test_worker_expires_mail_for_invalid_user_state(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
    kind: OutboxEventKind,
    is_deleted: bool,
    must_set_password: bool,
    expected_reason: str,
) -> None:
    test_student.is_deleted = is_deleted
    test_student.must_set_password = must_set_password
    db_session.add(test_student)
    service = OutboxService(SQLAlchemyOutboxRepository(db_session), settings.JWT_SECRET_KEY)
    if kind == OutboxEventKind.VERIFICATION_EMAIL:
        event = await service.enqueue_verification_email(test_student.email, "123456")
        cache_key = f"auth:code:{test_student.email}"
    else:
        event = await service.enqueue_password_reset_email(test_student.email, "123456")
        cache_key = f"auth:reset:{test_student.email}"
    await db_session.commit()
    await redis_client.set(cache_key, json.dumps({"code": "123456"}), ex=600)
    sent_recipients: list[str] = []

    async def capture_send(to_email: str, subject: str, body: str, force_transport: bool = False, **_: object) -> None:
        sent_recipients.append(to_email)

    email = EmailService()
    monkeypatch.setattr(email, "send_email", capture_send)
    worker = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=email)
    await worker.run_once(_make_test_session_factory())
    await db_session.refresh(event)
    assert sent_recipients == []
    assert event.status == OutboxEventStatus.EXPIRED
    assert event.encrypted_payload is None
    assert event.last_error == expected_reason
