from unittest.mock import AsyncMock
from typing import Any
from httpx import AsyncClient, Response
from app.models.debt_reminder_notification import DebtReminderNotification
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


class DebtPolicyFixture:
    @staticmethod
    async def preference(enabled: bool, payments_enabled: bool = True) -> None:
        from conftest import TestingSessionLocal
        session: AsyncSession
        async with TestingSessionLocal() as session:
            settings: OrgSettings | None = await session.get(OrgSettings, 1)
            if settings is None:
                session.add(OrgSettings(id=1, org_name="Synthetic", notify_debts=enabled, notify_payments=payments_enabled))
            else:
                settings.notify_debts = enabled
                settings.notify_payments = payments_enabled
            await session.commit()

    @staticmethod
    async def prepare(mentor: User) -> int:
        from datetime import date
        from app.tests.integration.debt_reminder_support import add_debt, create_student
        student_id: int = await create_student("wp32-debt-policy@example.test", 991100, "en")
        await add_debt(student_id, mentor.id, "Python", "25.00", date(2026, 1, 1))
        return student_id


@pytest.mark.asyncio
async def test_disabled_debt_policy_prevents_manual_queue_and_audit(
    client: AsyncClient, test_mentor: User, test_accountant: User,
) -> None:
    from app.models.audit_log import AuditLog
    from app.tests.integration.debt_reminder_support import all_reminders, bearer
    from conftest import TestingSessionLocal
    student_id: int = await DebtPolicyFixture.prepare(test_mentor)
    await DebtPolicyFixture.preference(False)
    response: Response = await client.post("/api/v1/finance/debts/reminders", json={"student_ids": [student_id]}, headers=bearer(test_accountant))
    assert response.status_code == 409
    assert await all_reminders() == []
    session: AsyncSession
    async with TestingSessionLocal() as session:
        assert await session.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == "debt_reminder")) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("recover_claim", [False, True])
async def test_disabled_debt_policy_blocks_claim_and_recovery(
    test_mentor: User, test_accountant: User, recover_claim: bool,
) -> None:
    from datetime import datetime, timedelta, timezone
    from app.repositories.sqlalchemy.debt_reminder_delivery_repository import SQLAlchemyDebtReminderDeliveryRepository
    from app.tests.integration.debt_reminder_support import MutableClock, RecordingSender, all_reminders
    from app.tests.integration.test_fin1a_debt_reminder_delivery import queue_reminder
    from app.workers.debt_reminder_delivery import DebtReminderDeliveryWorker
    from conftest import TestingSessionLocal
    moment: datetime = datetime(2026, 3, 10, tzinfo=timezone.utc)
    student_id: int = await DebtPolicyFixture.prepare(test_mentor)
    await queue_reminder(student_id, test_accountant, moment)
    if recover_claim:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            assert len(await SQLAlchemyDebtReminderDeliveryRepository(session).claim_due_batch("old", moment)) == 1
            await session.commit()
    await DebtPolicyFixture.preference(False)
    sender: RecordingSender = RecordingSender()
    assert await DebtReminderDeliveryWorker(TestingSessionLocal, sender, MutableClock(moment + timedelta(minutes=10))).run_once() == 0
    assert sender.messages == []
    row: DebtReminderNotification = (await all_reminders())[0]
    assert row.status != "sent"
    assert row.attempt_count == int(recover_claim)
    await DebtPolicyFixture.preference(True, False)
    assert await DebtReminderDeliveryWorker(TestingSessionLocal, sender, MutableClock(moment + timedelta(minutes=11))).run_once() == 1
    assert len(sender.messages) == 1
    row = (await all_reminders())[0]
    assert row.status == "sent"
    assert row.attempt_count == int(recover_claim) + 1


@pytest.mark.asyncio
async def test_disabling_debt_policy_after_claim_blocks_transport(
    test_mentor: User, test_accountant: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import datetime, timezone
    from app.repositories.sqlalchemy.debt_reminder_delivery_repository import SQLAlchemyDebtReminderDeliveryRepository
    from app.tests.integration.debt_reminder_support import MutableClock, RecordingSender, all_reminders
    from app.tests.integration.test_fin1a_debt_reminder_delivery import queue_reminder
    from app.workers.debt_reminder_delivery import DebtReminderDeliveryWorker
    from conftest import TestingSessionLocal
    moment: datetime = datetime(2026, 3, 10, tzinfo=timezone.utc)
    student_id: int = await DebtPolicyFixture.prepare(test_mentor)
    await queue_reminder(student_id, test_accountant, moment)
    session: AsyncSession
    async with TestingSessionLocal() as session:
        claimed: Any = await SQLAlchemyDebtReminderDeliveryRepository(session).claim_due_batch("claimed", moment)
        await session.commit()
    original: Any = SQLAlchemyDebtReminderDeliveryRepository.mark_send_started

    async def disable_before_send_start(repository: Any, notification_id: int, owner: str, now: datetime) -> bool:
        await DebtPolicyFixture.preference(False)
        return await original(repository, notification_id, owner, now)

    monkeypatch.setattr(SQLAlchemyDebtReminderDeliveryRepository, "mark_send_started", disable_before_send_start)
    sender: RecordingSender = RecordingSender()
    await DebtReminderDeliveryWorker(TestingSessionLocal, sender, MutableClock(moment)).deliver(claimed[0], "claimed")
    assert sender.messages == []
    row: DebtReminderNotification = (await all_reminders())[0]
    assert row.status != "sent"
    assert row.send_started_at is None


@pytest.mark.asyncio
async def test_manual_debt_reminders_ignore_payment_switch(
    test_mentor: User, test_accountant: User,
) -> None:
    from datetime import datetime, timezone
    from app.tests.integration.debt_reminder_support import MutableClock, RecordingSender, all_reminders
    from app.tests.integration.test_fin1a_debt_reminder_delivery import queue_reminder
    from app.workers.debt_reminder_delivery import DebtReminderDeliveryWorker
    from conftest import TestingSessionLocal
    moment: datetime = datetime(2026, 3, 10, tzinfo=timezone.utc)
    student_id: int = await DebtPolicyFixture.prepare(test_mentor)
    await DebtPolicyFixture.preference(True, False)
    await queue_reminder(student_id, test_accountant, moment)
    sender: RecordingSender = RecordingSender()
    assert await DebtReminderDeliveryWorker(TestingSessionLocal, sender, MutableClock(moment)).run_once() == 1
    assert len(sender.messages) == 1
    assert (await all_reminders())[0].status == "sent"
