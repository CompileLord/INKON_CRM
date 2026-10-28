from decimal import Decimal
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.charge import ChargeStatus
from app.models.enrollment import EnrollmentStatus
from app.models.ledger import LedgerEntryType
from app.models.notification_log import NotificationLog
from app.models.user import User
from app.tests.integration.wp32_reminder_support import ReminderFixture, ReminderScenario


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario_name,expected_count,expected_balance",
    [
        ("fully_paid", 0, None),
        ("discounted_paid", 0, None),
        ("partial", 1, "60.00"),
        ("refunded", 1, "100.00"),
        ("withdrawn", 1, "100.00"),
        ("cancelled", 0, None),
        ("deleted_charge", 0, None),
    ],
)
async def test_reminders_use_current_active_ledger_balance(
    db_session: AsyncSession,
    test_mentor: User,
    monkeypatch: pytest.MonkeyPatch,
    scenario_name: str,
    expected_count: int,
    expected_balance: str | None,
) -> None:
    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    if scenario_name == "fully_paid":
        await ReminderFixture.allocate(db_session, scenario, test_mentor, "100.00")
    elif scenario_name == "discounted_paid":
        await ReminderFixture.allocate(db_session, scenario, test_mentor, "80.00")
        await ReminderFixture.allocate(db_session, scenario, test_mentor, "20.00", LedgerEntryType.DISCOUNT)
    elif scenario_name == "partial":
        await ReminderFixture.allocate(db_session, scenario, test_mentor, "40.00")
    elif scenario_name == "refunded":
        await ReminderFixture.allocate(db_session, scenario, test_mentor, "100.00", reversed_allocation=True)
    elif scenario_name == "withdrawn":
        scenario.enrollment.status = EnrollmentStatus.WITHDRAWN
    elif scenario_name == "cancelled":
        scenario.charge.status = ChargeStatus.CANCELLED
    else:
        scenario.charge.is_deleted = True
    await db_session.commit()
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    assert enqueue.await_count == expected_count
    count: int = (await db_session.execute(select(func.count()).select_from(NotificationLog))).scalar_one()
    assert count == expected_count
    if expected_balance is not None:
        assert expected_balance in enqueue.call_args.kwargs["text"]


@pytest.mark.asyncio
async def test_charge_due_date_replaces_retired_payment_day(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor, days=1)
    scenario.student.payment_day_of_month = 1
    await db_session.commit()
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    assert enqueue.await_count == 1
    assert "2026-10-21" in enqueue.call_args.kwargs["text"]


@pytest.mark.asyncio
async def test_multiple_charges_due_together_are_one_exact_enrollment_reminder(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.models.charge import Charge

    scenario: ReminderScenario = await ReminderFixture.prepare(db_session, test_mentor)
    second: Charge = Charge(
        enrollment_id=scenario.enrollment.id,
        student_id=scenario.student.id,
        sequence_no=2,
        due_date=scenario.charge.due_date,
        amount=Decimal("25.50"),
    )
    db_session.add(second)
    await db_session.commit()
    await ReminderFixture.allocate(db_session, scenario, test_mentor, "40.00")
    enqueue: AsyncMock = await ReminderFixture.run(monkeypatch)
    assert enqueue.await_count == 1
    assert "85.50" in enqueue.call_args.kwargs["text"]
