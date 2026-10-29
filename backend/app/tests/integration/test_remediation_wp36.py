import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import Engine, event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting_period import AccountingPeriod, AccountingPeriodStatus
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.accounting_period import ClosePeriodPayload, ReopenPeriodPayload
from app.schemas.ledger import RefundPaymentPayload, VoidPaymentPayload
from app.services.finance_service import FinanceService, _to_dushanbe
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.test_remediation_wp07 import seed_ledger_scenario

PERIOD_LOCK_NAMESPACE: int = 36
WAIT_TIMEOUT_SECONDS: float = 20.0
BLOCKED_PROBE_SECONDS: float = 0.7


def month_of(moment: datetime) -> tuple[int, int]:
    local_moment: datetime = _to_dushanbe(moment)
    return local_moment.year, local_moment.month


def previous_month_moment() -> datetime:
    current_local: datetime = _to_dushanbe(datetime.now(timezone.utc))
    return current_local.replace(day=1, hour=12) - timedelta(days=5)


def current_month_moment() -> datetime:
    return datetime.now(timezone.utc)


async def seed_payment_at(session: AsyncSession, student: User, administrator: User, occurred_at: datetime) -> int:
    entry: LedgerEntry = LedgerEntry(
        student_id=student.id,
        type=LedgerEntryType.PAYMENT,
        amount=Decimal("100.00"),
        method=PaymentMethod.CASH,
        occurred_at=occurred_at,
        recorded_by_id=administrator.id,
    )
    session.add(entry)
    await session.commit()
    return entry.id


async def open_close_transaction(
    administrator: User, moment: datetime, release: asyncio.Event, locked: asyncio.Event
) -> None:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        year: int
        month: int
        year, month = month_of(moment)
        await FinanceService(session).close_period(year, month, ClosePeriodPayload(), administrator)
        locked.set()
        await asyncio.wait_for(release.wait(), timeout=WAIT_TIMEOUT_SECONDS)
        await session.commit()


async def post_payment(student: User, course_id: int, administrator: User, moment: datetime) -> bool:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        try:
            await FinanceService(session).create_payment(
                student.id, course_id, Decimal("10.00"), moment, PaymentMethod.CASH, None, administrator
            )
            await session.commit()
            return True
        except HTTPException as exception:
            await session.rollback()
            assert exception.status_code == 400
            return False


async def count_entries_in_month(moment: datetime) -> int:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        entries: list[LedgerEntry] = list((await session.scalars(select(LedgerEntry))).all())
    return len([entry for entry in entries if month_of(entry.occurred_at) == month_of(moment)])


async def seeded_course_id(db_session: AsyncSession, student: User, mentor: User, administrator: User) -> int:
    enrollment_id: int
    enrollment_id, _, _ = await seed_ledger_scenario(db_session, student, mentor, administrator)
    course_id: int = (await db_session.scalars(select(Enrollment.course_id).where(Enrollment.id == enrollment_id))).one()
    return course_id


@pytest.mark.asyncio
async def test_close_waits_for_inflight_posting_and_later_posting_is_rejected(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course_id: int = await seeded_course_id(db_session, test_student, test_mentor, test_admin)
    moment: datetime = current_month_moment()
    year: int
    month: int
    year, month = month_of(moment)
    posting_ready: asyncio.Event = asyncio.Event()
    posting_release: asyncio.Event = asyncio.Event()

    async def posting() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await FinanceService(session).create_payment(
                test_student.id, course_id, Decimal("10.00"), moment, PaymentMethod.CASH, None, test_admin
            )
            posting_ready.set()
            await asyncio.wait_for(posting_release.wait(), timeout=WAIT_TIMEOUT_SECONDS)
            await session.commit()

    async def closing() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await FinanceService(session).close_period(year, month, ClosePeriodPayload(), test_admin)
            await session.commit()

    posting_task: asyncio.Task[None] = asyncio.create_task(posting())
    await asyncio.wait_for(posting_ready.wait(), timeout=WAIT_TIMEOUT_SECONDS)
    closing_task: asyncio.Task[None] = asyncio.create_task(closing())
    done: set[asyncio.Task[None]]
    done, _ = await asyncio.wait({closing_task}, timeout=BLOCKED_PROBE_SECONDS)
    assert done == set()
    posting_release.set()
    await asyncio.wait_for(asyncio.gather(posting_task, closing_task), timeout=WAIT_TIMEOUT_SECONDS)
    assert await post_payment(test_student, course_id, test_admin, moment) is False
    assert await count_entries_in_month(moment) == 2


@pytest.mark.asyncio
async def test_posting_started_during_uncommitted_close_of_absent_month_is_rejected(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course_id: int = await seeded_course_id(db_session, test_student, test_mentor, test_admin)
    moment: datetime = current_month_moment()
    release: asyncio.Event = asyncio.Event()
    locked: asyncio.Event = asyncio.Event()
    closer: asyncio.Task[None] = asyncio.create_task(open_close_transaction(test_admin, moment, release, locked))
    await asyncio.wait_for(locked.wait(), timeout=WAIT_TIMEOUT_SECONDS)
    poster: asyncio.Task[bool] = asyncio.create_task(post_payment(test_student, course_id, test_admin, moment))
    done: set[asyncio.Task[bool]]
    done, _ = await asyncio.wait({poster}, timeout=BLOCKED_PROBE_SECONDS)
    assert done == set()
    release.set()
    await asyncio.wait_for(closer, timeout=WAIT_TIMEOUT_SECONDS)
    assert await asyncio.wait_for(poster, timeout=WAIT_TIMEOUT_SECONDS) is False
    assert await count_entries_in_month(moment) == 1


@pytest.mark.asyncio
async def test_posting_waits_for_uncommitted_reopen_and_then_succeeds(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course_id: int = await seeded_course_id(db_session, test_student, test_mentor, test_admin)
    moment: datetime = current_month_moment()
    year: int
    month: int
    year, month = month_of(moment)
    await FinanceService(db_session).close_period(year, month, ClosePeriodPayload(), test_admin)
    await db_session.commit()
    reopen_locked: asyncio.Event = asyncio.Event()
    reopen_release: asyncio.Event = asyncio.Event()

    async def reopening() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await FinanceService(session).reopen_period(year, month, ReopenPeriodPayload(reason_code="WP36"), test_admin)
            reopen_locked.set()
            await asyncio.wait_for(reopen_release.wait(), timeout=WAIT_TIMEOUT_SECONDS)
            await session.commit()

    reopener: asyncio.Task[None] = asyncio.create_task(reopening())
    await asyncio.wait_for(reopen_locked.wait(), timeout=WAIT_TIMEOUT_SECONDS)
    poster: asyncio.Task[bool] = asyncio.create_task(post_payment(test_student, course_id, test_admin, moment))
    done: set[asyncio.Task[bool]]
    done, _ = await asyncio.wait({poster}, timeout=BLOCKED_PROBE_SECONDS)
    assert done == set()
    reopen_release.set()
    await asyncio.wait_for(reopener, timeout=WAIT_TIMEOUT_SECONDS)
    assert await asyncio.wait_for(poster, timeout=WAIT_TIMEOUT_SECONDS) is True


@pytest.mark.asyncio
async def test_concurrent_closes_of_absent_month_create_one_period_row(test_admin: User) -> None:
    moment: datetime = current_month_moment()
    year: int
    month: int
    year, month = month_of(moment)
    barrier: asyncio.Barrier = asyncio.Barrier(2)

    async def closing() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await barrier.wait()
            await FinanceService(session).close_period(year, month, ClosePeriodPayload(), test_admin)
            await session.commit()

    await asyncio.wait_for(asyncio.gather(closing(), closing()), timeout=WAIT_TIMEOUT_SECONDS)
    session: AsyncSession
    async with TestingSessionLocal() as session:
        rows: int = (await session.scalar(select(func.count(AccountingPeriod.id)))) or 0
        status_value: AccountingPeriodStatus = (await session.scalars(select(AccountingPeriod.status))).one()
    assert rows == 1
    assert status_value == AccountingPeriodStatus.CLOSED


@pytest.mark.asyncio
async def test_late_settlement_of_old_obligation_in_open_month_stays_permitted(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course_id: int = await seeded_course_id(db_session, test_student, test_mentor, test_admin)
    old_year: int
    old_month: int
    old_year, old_month = month_of(previous_month_moment())
    await FinanceService(db_session).close_period(old_year, old_month, ClosePeriodPayload(), test_admin)
    await db_session.commit()
    assert await post_payment(test_student, course_id, test_admin, current_month_moment()) is True
    assert await post_payment(test_student, course_id, test_admin, previous_month_moment()) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["void", "refund"])
async def test_cross_month_reversals_with_concurrent_closes_do_not_deadlock(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, operation: str
) -> None:
    payment_ids: list[int] = [
        await seed_payment_at(db_session, test_student, test_admin, previous_month_moment()) for _ in range(4)
    ]
    original_year: int
    original_month: int
    original_year, original_month = month_of(previous_month_moment())
    current_year: int
    current_month: int
    current_year, current_month = month_of(current_month_moment())
    barrier: asyncio.Barrier = asyncio.Barrier(6)
    outcomes: list[str] = []

    async def reverse(payment_id: int) -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await barrier.wait()
            try:
                if operation == "void":
                    await FinanceService(session).void_payment(payment_id, VoidPaymentPayload(reason_code="WP36"), test_admin)
                else:
                    await FinanceService(session).refund_payment(
                        payment_id, RefundPaymentPayload(amount=Decimal("10.00"), reason_code="WP36", to_wallet=True), test_admin
                    )
                await session.commit()
                outcomes.append("committed")
            except HTTPException as exception:
                await session.rollback()
                assert exception.status_code == 400
                outcomes.append("rejected")

    async def close(year: int, month: int) -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await barrier.wait()
            await FinanceService(session).close_period(year, month, ClosePeriodPayload(), test_admin)
            await session.commit()

    await asyncio.wait_for(
        asyncio.gather(
            *[reverse(payment_id) for payment_id in payment_ids],
            close(original_year, original_month),
            close(current_year, current_month),
        ),
        timeout=WAIT_TIMEOUT_SECONDS,
    )
    assert len(outcomes) == 4
    session: AsyncSession
    async with TestingSessionLocal() as session:
        reversal_count: int = (
            await session.scalar(select(func.count(LedgerEntry.id)).where(LedgerEntry.reverses_entry_id.in_(payment_ids)))
        ) or 0
        closed_count: int = (
            await session.scalar(
                select(func.count(AccountingPeriod.id)).where(AccountingPeriod.status == AccountingPeriodStatus.CLOSED)
            )
        ) or 0
    assert reversal_count == outcomes.count("committed")
    assert closed_count == 2


@pytest.mark.asyncio
async def test_same_month_postings_for_different_students_hold_shared_locks_together(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User
) -> None:
    course_id: int = await seeded_course_id(db_session, test_student, test_mentor, test_admin)
    moment: datetime = current_month_moment()
    year: int
    month: int
    year, month = month_of(moment)
    expected_key: int = year * 12 + (month - 1)
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    observed_lock_modes: list[list[str]] = []

    async def posting() -> None:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            await FinanceService(session)._check_period_open(moment, "payment")
            await barrier.wait()
            modes: list[str] = list(
                (
                    await session.scalars(
                        text(
                            "SELECT locks.mode FROM pg_locks AS locks JOIN pg_stat_activity AS activity USING (pid) "
                            "WHERE locks.locktype = 'advisory' AND locks.classid = :namespace "
                            "AND locks.objid = :period_key AND locks.granted "
                            "AND activity.application_name = current_setting('application_name')"
                        ).bindparams(namespace=PERIOD_LOCK_NAMESPACE, period_key=expected_key)
                    )
                ).all()
            )
            observed_lock_modes.append(modes)
            await barrier.wait()
            await session.commit()

    await asyncio.wait_for(asyncio.gather(posting(), posting()), timeout=WAIT_TIMEOUT_SECONDS)
    assert observed_lock_modes[0] == ["ShareLock", "ShareLock"]
    session: AsyncSession
    async with TestingSessionLocal() as session:
        remaining: int = (
            await session.scalar(
                text("SELECT count(*) FROM pg_locks AS locks JOIN pg_stat_activity AS activity USING (pid) "
                     "WHERE locks.locktype = 'advisory' AND locks.classid = :namespace "
                     "AND activity.application_name = current_setting('application_name')").bindparams(
                    namespace=PERIOD_LOCK_NAMESPACE
                )
            )
        ) or 0
    assert remaining == 0


@pytest.mark.asyncio
async def test_void_locks_both_months_sorted_after_account_lock_and_holds_until_commit(
    db_session: AsyncSession, test_student: User, test_admin: User
) -> None:
    payment_id: int = await seed_payment_at(db_session, test_student, test_admin, previous_month_moment())
    statements: list[str] = []
    statement_parameters: list[object] = []
    session: AsyncSession
    async with TestingSessionLocal() as session:
        sync_engine: Engine = session.bind.sync_engine

        def record_statement(
            connection: object, cursor: object, statement: str, parameters: object, *rest: object
        ) -> None:
            statements.append(statement)
            statement_parameters.append(parameters)

        event.listen(sync_engine, "before_cursor_execute", record_statement)
        try:
            await FinanceService(session).void_payment(payment_id, VoidPaymentPayload(reason_code="WP36"), test_admin)
            period_keys: list[int] = list(
                (
                    await session.scalars(
                        text(
                            "SELECT objid FROM pg_locks WHERE locktype = 'advisory' AND classid = :namespace "
                            "AND pid = pg_backend_pid() ORDER BY objid"
                        ).bindparams(namespace=PERIOD_LOCK_NAMESPACE)
                    )
                ).all()
            )
        finally:
            event.remove(sync_engine, "before_cursor_execute", record_statement)
        expected_keys: list[int] = sorted(
            {
                month_of(previous_month_moment())[0] * 12 + month_of(previous_month_moment())[1] - 1,
                month_of(current_month_moment())[0] * 12 + month_of(current_month_moment())[1] - 1,
            }
        )
        assert period_keys == expected_keys
        account_lock_index: int = next(index for index, sql in enumerate(statements) if "FOR UPDATE" in sql)
        month_lock_indexes: list[int] = [index for index, sql in enumerate(statements) if "pg_advisory_xact_lock_shared" in sql]
        assert len(month_lock_indexes) == len(expected_keys)
        acquired_keys: list[int] = [int(statement_parameters[index][1]) for index in month_lock_indexes]
        assert acquired_keys == expected_keys
        assert min(month_lock_indexes) > account_lock_index
        await session.commit()
        remaining: int = (
            await session.scalar(
                text("SELECT count(*) FROM pg_locks AS locks JOIN pg_stat_activity AS activity USING (pid) "
                     "WHERE locks.locktype = 'advisory' AND locks.classid = :namespace "
                     "AND activity.application_name = current_setting('application_name')").bindparams(
                    namespace=PERIOD_LOCK_NAMESPACE
                )
            )
        ) or 0
        assert remaining == 0
