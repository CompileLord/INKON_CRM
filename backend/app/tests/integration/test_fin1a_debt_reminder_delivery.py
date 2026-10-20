import asyncio
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
import pytest
from aiogram.exceptions import TelegramForbiddenError, TelegramNetworkError, TelegramRetryAfter
from aiogram.methods import SendMessage
from sqlalchemy import select
from app.models.charge import Charge, ChargeStatus
from app.models.debt_reminder_notification import DebtReminderNotification
from app.models.user import User
from app.repositories.sqlalchemy.debt_reminder_delivery_repository import SQLAlchemyDebtReminderDeliveryRepository
from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
from app.services.audit_service import AuditService
from app.services.debt_reminder_service import DebtReminderService
from app.telegram_bot.messages import TelegramMessageCatalog
from app.tests.integration.debt_reminder_support import (
    MutableClock, RecordingSender, add_charge, add_debt, all_reminders, create_student,
)
from app.workers.debt_reminder_delivery import DebtReminderDeliveryWorker, deliver_due_debt_reminders
from conftest import TestingSessionLocal

CHAT_ID: int = 888001
NOW: datetime = datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc)
DUE: date = date(2026, 3, 1)
SEND_METHOD: SendMessage = SendMessage(chat_id=1, text="x")


def build_worker(sender: RecordingSender, clock: MutableClock) -> DebtReminderDeliveryWorker:
    return DebtReminderDeliveryWorker(TestingSessionLocal, sender, clock)


async def queue_reminder(student_id: int, actor: User, moment: datetime = NOW) -> None:
    session: Any
    async with TestingSessionLocal() as session:
        service: DebtReminderService = DebtReminderService(
            SQLAlchemyDebtReminderRepository(session), AuditService(session), MutableClock(moment)
        )
        await service.queue([student_id], actor.id)


async def prepare(mentor: User, accountant: User, language: str = "ru", amount: str = "100.00") -> int:
    student_id: int = await create_student(f"worker-{language}@example.com", CHAT_ID, language)
    await add_debt(student_id, mentor.id, "Python", amount, DUE)
    await queue_reminder(student_id, accountant)
    return student_id


@pytest.mark.asyncio
@pytest.mark.parametrize("language,currency", [("ru", "сомони"), ("tg", "сомонӣ"), ("en", "TJS")])
async def test_message_is_localized_and_lists_name_total_and_courses(
    test_mentor: User, test_accountant: User, language: str, currency: str
) -> None:
    student_id: int = await prepare(test_mentor, test_accountant, language, "100.00")
    await add_debt(student_id, test_mentor.id, "SQL Basics", "25.50", DUE)
    sender: RecordingSender = RecordingSender()
    assert await build_worker(sender, MutableClock(NOW)).run_once() == 1
    chat_id: int
    text: str
    chat_id, text = sender.messages[0]
    assert chat_id == CHAT_ID
    assert "Ali Valiev" in text
    assert f"125.50 {currency}" in text
    assert f"Python: 100.00 {currency}" in text
    assert f"SQL Basics: 25.50 {currency}" in text
    assert "http" not in text and "IBAN" not in text
    assert (await all_reminders())[0].status == "sent"


@pytest.mark.asyncio
async def test_amount_is_rendered_at_send_time_not_queue_time(test_mentor: User, test_accountant: User) -> None:
    student_id: int = await prepare(test_mentor, test_accountant)
    session: Any
    async with TestingSessionLocal() as session:
        enrollment_id: int = (await session.execute(select(Charge.enrollment_id))).scalars().first()
    await add_charge(enrollment_id, student_id, "40.00", DUE, 2)
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(NOW)).run_once()
    assert "140.00 сомони" in sender.messages[0][1]
    assert "100.00 сомони" not in sender.messages[0][1]


@pytest.mark.asyncio
async def test_reminder_is_skipped_when_debt_is_cleared_before_sending(
    test_mentor: User, test_accountant: User
) -> None:
    await prepare(test_mentor, test_accountant)
    session: Any
    async with TestingSessionLocal() as session:
        for charge in (await session.execute(select(Charge))).scalars().all():
            charge.status = ChargeStatus.CANCELLED
        await session.commit()
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(NOW)).run_once()
    assert sender.messages == []
    row: DebtReminderNotification = (await all_reminders())[0]
    assert (row.status, row.last_error) == ("skipped", "no_current_debt_or_parent")


@pytest.mark.asyncio
async def test_reminder_is_skipped_when_parent_chat_was_unlinked(test_mentor: User, test_accountant: User) -> None:
    student_id: int = await prepare(test_mentor, test_accountant)
    session: Any
    async with TestingSessionLocal() as session:
        student: User | None = await session.get(User, student_id)
        assert student is not None
        student.parent_telegram_chat_id = None
        await session.commit()
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(NOW)).run_once()
    assert sender.messages == []
    assert (await all_reminders())[0].status == "skipped"


@pytest.mark.asyncio
async def test_blocked_bot_is_permanently_failed_and_never_retried(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    sender: RecordingSender = RecordingSender(failures=[TelegramForbiddenError(method=SEND_METHOD, message="blocked")])
    clock: MutableClock = MutableClock(NOW)
    worker: DebtReminderDeliveryWorker = build_worker(sender, clock)
    await worker.run_once()
    clock.moment += timedelta(days=2)
    assert await worker.run_once() == 0
    row: DebtReminderNotification = (await all_reminders())[0]
    assert (row.status, row.last_error, row.attempt_count) == ("failed", "parent_chat_unavailable", 1)
    assert sender.messages == []


@pytest.mark.asyncio
async def test_retry_after_postpones_at_least_the_requested_delay(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    sender: RecordingSender = RecordingSender(
        failures=[TelegramRetryAfter(method=SEND_METHOD, message="flood", retry_after=900)]
    )
    clock: MutableClock = MutableClock(NOW)
    worker: DebtReminderDeliveryWorker = build_worker(sender, clock)
    await worker.run_once()
    row: DebtReminderNotification = (await all_reminders())[0]
    assert row.status == "pending"
    assert row.due_at == NOW + timedelta(seconds=900)
    clock.moment = NOW + timedelta(seconds=899)
    assert await worker.run_once() == 0
    clock.moment = NOW + timedelta(seconds=900)
    assert await worker.run_once() == 1
    assert len(sender.messages) == 1


@pytest.mark.asyncio
async def test_network_error_backs_off_then_sends_exactly_once(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    sender: RecordingSender = RecordingSender(failures=[TelegramNetworkError(method=SEND_METHOD, message="down")])
    clock: MutableClock = MutableClock(NOW)
    worker: DebtReminderDeliveryWorker = build_worker(sender, clock)
    await worker.run_once()
    row: DebtReminderNotification = (await all_reminders())[0]
    assert (row.status, row.due_at, row.last_error) == ("pending", NOW + timedelta(seconds=60), "TelegramNetworkError")
    clock.moment += timedelta(seconds=61)
    await worker.run_once()
    clock.moment += timedelta(days=1)
    assert await worker.run_once() == 0
    assert len(sender.messages) == 1
    assert (await all_reminders())[0].status == "sent"


@pytest.mark.asyncio
async def test_repeated_failures_end_in_failed_after_maximum_attempts(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    sender: RecordingSender = RecordingSender(
        failures=[TelegramNetworkError(method=SEND_METHOD, message="down") for _ in range(10)]
    )
    clock: MutableClock = MutableClock(NOW)
    worker: DebtReminderDeliveryWorker = build_worker(sender, clock)
    for _ in range(8):
        await worker.run_once()
        clock.moment += timedelta(hours=2)
    row: DebtReminderNotification = (await all_reminders())[0]
    assert (row.status, row.attempt_count) == ("failed", 5)
    assert sender.messages == []


@pytest.mark.asyncio
async def test_crash_after_send_started_never_resends(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    session: Any
    async with TestingSessionLocal() as session:
        repository: SQLAlchemyDebtReminderDeliveryRepository = SQLAlchemyDebtReminderDeliveryRepository(session)
        claimed: Any = await repository.claim_due_batch("crashed", NOW)
        assert await repository.mark_send_started(claimed[0].id, "crashed", NOW)
        await session.commit()
    sender: RecordingSender = RecordingSender()
    clock: MutableClock = MutableClock(NOW + timedelta(minutes=10))
    await build_worker(sender, clock).run_once()
    await build_worker(sender, clock).run_once()
    row: DebtReminderNotification = (await all_reminders())[0]
    assert sender.messages == []
    assert (row.status, row.last_error) == ("failed", "delivery_outcome_unknown")


@pytest.mark.asyncio
async def test_crash_before_send_started_is_released_and_sent_once(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    session: Any
    async with TestingSessionLocal() as session:
        claimed: Any = await SQLAlchemyDebtReminderDeliveryRepository(session).claim_due_batch("crashed", NOW)
        assert len(claimed) == 1
        await session.commit()
    sender: RecordingSender = RecordingSender()
    await build_worker(sender, MutableClock(NOW + timedelta(minutes=10))).run_once()
    assert len(sender.messages) == 1


@pytest.mark.asyncio
async def test_two_workers_send_each_reminder_once(test_mentor: User, test_accountant: User) -> None:
    await prepare(test_mentor, test_accountant)
    sender: RecordingSender = RecordingSender()
    counts: list[int] = await asyncio.gather(
        build_worker(sender, MutableClock(NOW)).run_once(), build_worker(sender, MutableClock(NOW)).run_once()
    )
    assert sorted(counts) == [0, 1]
    assert len(sender.messages) == 1


@pytest.mark.asyncio
async def test_future_reminder_waits_until_due(test_mentor: User, test_accountant: User) -> None:
    student_id: int = await create_student("future@example.com", CHAT_ID, "ru")
    await add_debt(student_id, test_mentor.id, "Python", "10.00", DUE)
    await queue_reminder(student_id, test_accountant, NOW + timedelta(hours=1))
    sender: RecordingSender = RecordingSender()
    assert await build_worker(sender, MutableClock(NOW)).run_once() == 0
    assert sender.messages == []


def test_cron_runs_the_debt_reminder_delivery_job() -> None:
    from app.workers.settings import WorkerSettings
    names: set[str] = {job.name for job in WorkerSettings.cron_jobs}
    assert "cron:deliver_due_debt_reminders" in names
    assert deliver_due_debt_reminders in WorkerSettings.functions


class TestDebtReminderCatalog:
    keys: tuple[str, ...] = ("debt_reminder", "debt_currency")

    @pytest.mark.parametrize("key", keys)
    def test_every_language_has_the_key_with_matching_placeholders(self, key: str) -> None:
        texts: dict[str, str] = TelegramMessageCatalog.texts[key]
        assert set(texts) == {"ru", "tg", "en"}
        placeholders: set[frozenset[str]] = {frozenset(re.findall(r"{(\w+)}", text)) for text in texts.values()}
        assert len(placeholders) == 1

    def test_currency_words_follow_the_specification(self) -> None:
        assert TelegramMessageCatalog.texts["debt_currency"] == {"tg": "сомонӣ", "ru": "сомони", "en": "TJS"}
