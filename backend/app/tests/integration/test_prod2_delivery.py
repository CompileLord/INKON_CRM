import asyncio
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.outbox_event import OutboxEvent, OutboxEventStatus
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.email_service import EmailService
from app.services.outbox_service import OutboxService
from app.tests.conftest import TestingSessionLocal
from app.workers import outbox
from app.workers.outbox import OutboxWorkerManager


class TestDeliveryReliability:
    @pytest.mark.asyncio
    async def test_unused_late_claim_is_free_and_can_deliver_later(self, db_session: AsyncSession) -> None:
        repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(db_session)
        event: OutboxEvent = await OutboxService(repository, settings.JWT_SECRET_KEY).enqueue_verification_email(
            "late@example.com", "123456",
        )
        await db_session.commit()
        now: datetime = datetime.now(timezone.utc)
        await repository.claim_pending_batch("slow", 1, 1, now)
        await db_session.commit()
        await db_session.refresh(event)
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        assert not await worker.process_single_event(event, "slow", TestingSessionLocal)
        await db_session.refresh(event)
        assert event.attempt_count == 0
        assert event.status == OutboxEventStatus.PENDING
        assert event.encrypted_payload is not None
        claimed: Any = await repository.claim_pending_batch("fresh", 60, 1, now)
        await db_session.commit()
        assert len(claimed) == 1
        assert await repository.begin_attempt(event.id, "fresh", now, 14) == 1
        assert await repository.mark_delivered(event.id, "fresh", now)
        await db_session.commit()
        await db_session.refresh(event)
        assert event.status == OutboxEventStatus.DELIVERED
        assert event.attempt_count == 1

    @pytest.mark.asyncio
    async def test_attempts_are_bounded_and_fenced(self, db_session: AsyncSession) -> None:
        repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(db_session)
        event: OutboxEvent = await OutboxService(repository, settings.JWT_SECRET_KEY).enqueue_verification_email(
            "bounded@example.com", "123456",
        )
        event.max_attempts = 2
        await db_session.commit()
        now: datetime = datetime.now(timezone.utc)
        attempt: int
        for attempt in range(1, 3):
            await repository.claim_pending_batch("owner", 60, 1, now)
            assert await repository.begin_attempt(event.id, "intruder", now, 14) is None
            assert await repository.begin_attempt(event.id, "owner", now, 14) == attempt
            await repository.mark_failed(event.id, "owner", "transport_failure", now, now)
            await db_session.commit()
        assert not await repository.claim_pending_batch("third", 60, 1, now)
        await db_session.refresh(event)
        assert event.status == OutboxEventStatus.FAILED
        assert event.attempt_count == 2
        assert event.encrypted_payload is None

    @pytest.mark.asyncio
    async def test_worker_claims_one_fresh_event_after_previous_delivery(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(db_session)
        service: OutboxService = OutboxService(repository, settings.JWT_SECRET_KEY)
        index: int
        for index in range(2):
            await service.enqueue_verification_email(f"serial{index}@example.com", "123456")
        await db_session.commit()
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
        visited: list[int] = []

        async def inspect_claim(event: OutboxEvent, owner: str, factory: Any) -> bool:
            async with factory() as session:
                rows: list[OutboxEvent] = list((await session.scalars(select(OutboxEvent))).all())
                assert sum(row.status == OutboxEventStatus.CLAIMED for row in rows) == 1
                assert all(row.attempt_count == 0 for row in rows)
                await asyncio.sleep(0.02)
                await SQLAlchemyOutboxRepository(session).mark_delivered(event.id, owner, datetime.now(timezone.utc))
                await session.commit()
            visited.append(event.id)
            return True

        monkeypatch.setattr(worker, "process_single_event", inspect_claim)
        assert await worker.run_once(TestingSessionLocal) == 2
        assert len(set(visited)) == 2

    @pytest.mark.asyncio
    @pytest.mark.parametrize("steal_lease", [False, True])
    async def test_transport_deadline_aborts_without_delivery_and_settlement_is_fenced(
        self, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch, steal_lease: bool,
    ) -> None:
        repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(db_session)
        event: OutboxEvent = await OutboxService(repository, settings.JWT_SECRET_KEY).enqueue_verification_email(
            "timeout@example.com", "123456",
        )
        await db_session.commit()
        cancelled: asyncio.Event = asyncio.Event()
        email: EmailService = EmailService()

        async def stalled_send(**kwargs: Any) -> None:
            if steal_lease:
                async with TestingSessionLocal() as session:
                    await session.execute(update(OutboxEvent).where(OutboxEvent.id == event.id).values(lease_owner="replacement"))
                    await session.commit()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        monkeypatch.setattr(email, "send_email", stalled_send)
        monkeypatch.setattr(outbox, "SMTP_TRANSPORT_TIMEOUT_SECONDS", 0.01)
        worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY, email_service=email, batch_size=1)
        monkeypatch.setattr(worker, "check_verification_state", AsyncMock(return_value=(True, "")))
        assert await worker.run_once(TestingSessionLocal) == 1
        assert cancelled.is_set()
        await db_session.refresh(event)
        assert event.status == (OutboxEventStatus.CLAIMED if steal_lease else OutboxEventStatus.PENDING)
        assert event.delivered_at is None
        assert event.encrypted_payload is not None
        assert event.attempt_count == 1
        if steal_lease:
            assert event.lease_owner == "replacement"
