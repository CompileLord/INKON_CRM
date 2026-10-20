from unittest.mock import AsyncMock
from typing import Any
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification_log import NotificationLog
from app.models.org_settings import OrgSettings
from app.models.user import User
from app.tests.integration.wp32_reminder_support import ReminderFixture, ReminderScenario
from app.workers import tasks


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payments_enabled,debts_enabled,expected_count", [(False, True, 0), (False, False, 0), (True, False, 1)]
)
async def test_upcoming_reminders_follow_payment_switch_independently(
    db_session: AsyncSession,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
    payments_enabled: bool,
    debts_enabled: bool,
    expected_count: int,
) -> None:
    await ReminderFixture.prepare(db_session, test_mentor)
    db_session.add(
        OrgSettings(id=1, org_name="Synthetic", notify_payments=payments_enabled, notify_debts=debts_enabled)
    )
    await db_session.commit()
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    assert enqueue.await_count == expected_count
    count: int = (await db_session.execute(select(func.count()).select_from(NotificationLog))).scalar_one()
    assert count == expected_count


@pytest.mark.asyncio
async def test_disable_after_enqueue_prevents_claim_and_send(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    await ReminderFixture.prepare(db_session, test_mentor)
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    assert enqueue.await_count == 1
    db_session.add(OrgSettings(id=1, org_name="Synthetic", notify_payments=False, notify_debts=True))
    await db_session.commit()
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_not_awaited()
    log: NotificationLog = (
        await db_session.execute(select(NotificationLog).execution_options(populate_existing=True))
    ).scalar_one()
    assert log.status != "sent"
    assert log.attempts == 0


@pytest.mark.asyncio
async def test_payment_after_enqueue_prevents_claim_and_send(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    await ReminderFixture.allocate(db_session, scenario, test_mentor, "100.00")
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_not_awaited()
    log: NotificationLog = (
        await db_session.execute(select(NotificationLog).execution_options(populate_existing=True))
    ).scalar_one()
    assert log.status != "sent"
    assert log.attempts == 0


@pytest.mark.asyncio
async def test_partial_payment_after_enqueue_refreshes_actual_send_amount(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    await ReminderFixture.allocate(db_session, scenario, test_mentor, "25.00")
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_awaited_once()
    assert "75.00" in sender.call_args.args[1]
    assert "100.00" not in sender.call_args.args[1]


@pytest.mark.asyncio
async def test_disable_between_claim_and_send_stops_transport_and_can_resume(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.notification_service import NotificationService
    from app.repositories.interfaces.notification_log_repository import NotificationClaim
    from app.tests.conftest import TestingSessionLocal

    await ReminderFixture.prepare(db_session, test_mentor)
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    original: Any = NotificationService.claim_notification

    async def claim_then_disable(
        self: NotificationService, notification_id: int, revision: int
    ) -> NotificationClaim | None:
        claim: NotificationClaim | None = await original(self, notification_id, revision)
        assert claim is not None
        session: AsyncSession
        async with TestingSessionLocal() as session:
            session.add(OrgSettings(id=1, org_name="Synthetic", notify_payments=False, notify_debts=True))
            await session.commit()
        return claim

    monkeypatch.setattr(NotificationService, "claim_notification", claim_then_disable)
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_not_awaited()
    log: NotificationLog = (
        await db_session.execute(select(NotificationLog).execution_options(populate_existing=True))
    ).scalar_one()
    assert log.status == "failed"
    assert log.attempts == 1
    assert log.is_terminal is False
    from sqlalchemy import update

    await db_session.execute(update(OrgSettings).values(notify_payments=True))
    await db_session.commit()
    monkeypatch.setattr(NotificationService, "claim_notification", original)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_awaited_once()


@pytest.mark.asyncio
async def test_partial_payment_between_claim_and_send_refreshes_balance(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.notification_service import NotificationService
    from app.repositories.interfaces.notification_log_repository import NotificationClaim
    from app.tests.conftest import TestingSessionLocal

    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    original: Any = NotificationService.claim_notification

    async def claim_then_pay(
        self: NotificationService, notification_id: int, revision: int
    ) -> NotificationClaim | None:
        claim: NotificationClaim | None = await original(self, notification_id, revision)
        assert claim is not None
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await ReminderFixture.allocate(session, scenario, test_mentor, "45.00")
        return claim

    monkeypatch.setattr(NotificationService, "claim_notification", claim_then_pay)
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_awaited_once()
    assert "55.00" in sender.call_args.args[1]
    assert "100.00" not in sender.call_args.args[1]


@pytest.mark.asyncio
async def test_refund_after_enqueue_refreshes_restored_balance(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import datetime, timezone
    from decimal import Decimal
    from app.models.ledger import LedgerEntry, LedgerEntryType
    from app.models.allocation import Allocation

    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    allocation: Allocation = await ReminderFixture.allocate(db_session, scenario, test_mentor, "75.00")
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    refund: LedgerEntry = LedgerEntry(
        student_id=scenario.student.id,
        recorded_by_id=test_mentor.id,
        type=LedgerEntryType.REFUND,
        amount=Decimal("75.00"),
        occurred_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
        reverses_entry_id=allocation.ledger_entry_id,
        is_cash_out=True,
    )
    db_session.add(refund)
    await db_session.flush()
    allocation.reversed_by_entry_id = refund.id
    await db_session.commit()
    payload: dict[str, Any] = dict(enqueue.call_args.kwargs)
    payload.pop("_job_id")
    sender: AsyncMock = AsyncMock()
    monkeypatch.setattr(tasks.bot, "send_message", sender)
    await tasks.send_telegram_message({}, **payload)
    sender.assert_awaited_once()
    assert "100.00" in sender.call_args.args[1]
    assert "25.00" not in sender.call_args.args[1]


@pytest.mark.asyncio
async def test_recovery_does_not_enqueue_disabled_or_paid_rows(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    await ReminderFixture.prepare(db_session, test_mentor)
    await ReminderFixture.run(monkeypatch)
    db_session.add(OrgSettings(id=1, org_name="Synthetic", notify_payments=False, notify_debts=True))
    await db_session.commit()
    enqueue: AsyncMock = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
    assert await tasks.recover_notification_deliveries({}) == 0
    enqueue.assert_not_awaited()
