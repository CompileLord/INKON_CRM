import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.outbox_event import OutboxEvent, OutboxEventStatus
from app.models.user import User
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.sms.sender import SmsSendResult
from app.tests.sms_fakes import FakeSmsSender
from app.tests.sms_test_support import SmsPasswordTestSupport
from app.workers.outbox import OutboxWorkerManager
from app.workers.sms_delivery import StudentPasswordSmsDispatcher


class ObservingSmsSender(FakeSmsSender):
    def __init__(self, factory: async_sessionmaker[AsyncSession], event_id: int) -> None:
        super().__init__()
        self.factory: async_sessionmaker[AsyncSession] = factory
        self.event_id: int = event_id
        self.observed: list[tuple[OutboxEventStatus, int]] = []

    async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
        session: AsyncSession
        async with self.factory() as session:
            row: OutboxEvent = await session.get(OutboxEvent, self.event_id)
            self.observed.append((row.status, row.attempt_count))
        return await super().send(phone_e164, message, idempotency_key)


class HangingSmsSender(FakeSmsSender):
    def __init__(self) -> None:
        super().__init__()
        self.cancelled: asyncio.Event = asyncio.Event()

    async def send(self, phone_e164: str, message: str, idempotency_key: str) -> SmsSendResult:
        try:
            await asyncio.Event().wait()
        finally:
            self.cancelled.set()
        raise AssertionError("unreachable")


class TestSmsDeliveryClaimModel:
    @pytest.mark.asyncio
    async def test_attempt_is_counted_only_when_transport_begins(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession,
    ) -> None:
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        user_id: int = created.json()["id"]
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, user_id))[0]
        assert event.attempt_count == 0
        factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()
        sender: ObservingSmsSender = ObservingSmsSender(factory, event.id)
        await SmsPasswordTestSupport.build_worker(sender).run_once(factory)
        assert sender.observed == [(OutboxEventStatus.CLAIMED, 1)]
        await db_session.refresh(event)
        assert event.status == OutboxEventStatus.DELIVERED
        assert event.attempt_count == 1

    @pytest.mark.asyncio
    async def test_claim_without_enough_lease_is_released_without_attempt(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession,
    ) -> None:
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0]
        factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()
        sender: FakeSmsSender = FakeSmsSender()
        worker: OutboxWorkerManager = SmsPasswordTestSupport.build_worker(sender)
        worker.sms_dispatcher = StudentPasswordSmsDispatcher(sender, 0, 0, 10, transport_deadline_seconds=100.0)
        assert await worker.run_once(factory) == 1
        await db_session.refresh(event)
        assert sender.sends == []
        assert event.status == OutboxEventStatus.PENDING
        assert event.attempt_count == 0
        assert event.lease_owner is None
        assert event.encrypted_payload is not None

    @pytest.mark.asyncio
    async def test_hung_transport_is_aborted_at_deadline_and_retried_later(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession,
    ) -> None:
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0]
        factory: async_sessionmaker[AsyncSession] = SmsPasswordTestSupport.build_session_factory()
        sender: HangingSmsSender = HangingSmsSender()
        worker: OutboxWorkerManager = SmsPasswordTestSupport.build_worker(sender)
        worker.sms_dispatcher = StudentPasswordSmsDispatcher(sender, 0, 0, 10, transport_deadline_seconds=0.05)
        started_at: float = time.monotonic()
        processed: Any = await asyncio.wait_for(worker.run_once(factory), timeout=5.0)
        assert time.monotonic() - started_at < 2.0
        assert processed == 1
        assert sender.cancelled.is_set()
        await db_session.refresh(event)
        assert event.status == OutboxEventStatus.PENDING
        assert event.attempt_count == 1
        assert event.last_error == "sms_transport_deadline_exceeded"
        assert event.delivered_at is None
        assert event.encrypted_payload is not None

    @pytest.mark.asyncio
    async def test_sms_settlement_requires_current_lease_owner(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession,
    ) -> None:
        created: Response = await SmsPasswordTestSupport.create_student_via_api(client, test_admin, None)
        event: OutboxEvent = (await SmsPasswordTestSupport.sms_events(db_session, created.json()["id"]))[0]
        repository: SQLAlchemyOutboxRepository = SQLAlchemyOutboxRepository(db_session)
        now: datetime = datetime.now(timezone.utc)
        await repository.claim_pending_batch("original", 60, 10, now)
        await db_session.commit()
        assert not await repository.mark_delivered(event.id, "intruder", now, "id", "sent")
        await db_session.commit()
        await db_session.refresh(event)
        assert event.status == OutboxEventStatus.CLAIMED
        assert event.delivered_at is None
