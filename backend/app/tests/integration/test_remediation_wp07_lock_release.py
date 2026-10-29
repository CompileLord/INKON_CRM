import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable

import pytest
from fastapi import HTTPException
from sqlalchemy import Result, event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import Executable

from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User, UserRole
from app.schemas.ledger import (
    AdjustmentCreatePayload,
    AllocationCreatePayload,
    DiscountCreatePayload,
    RefundPaymentPayload,
    VoidPaymentPayload,
)
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService


from app.tests.integration.test_remediation_wp07 import seed_ledger_scenario


@pytest.mark.asyncio
async def test_cancelled_financial_writer_rolls_back_and_releases_waiting_student_lock(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
) -> None:
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    blocker = factory()
    writer = factory()
    await blocker.execute(select(User.id).where(User.id == test_student.id).with_for_update())
    writer_returned = asyncio.Event()
    writer_pid: int | None = None
    mutation_flushed = asyncio.Event()

    def record_flush(session: object, flush_context: object) -> None:
        mutation_flushed.set()

    event.listen(writer.sync_session, "after_flush", record_flush)

    async def write_and_commit() -> None:
        nonlocal writer_pid
        try:
            writer_pid = (await writer.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            await FinanceService(writer).create_adjustment(
                AdjustmentCreatePayload(
                    student_id=test_student.id,
                    amount=Decimal("1.00"),
                    reason_code="WP07-CANCEL",
                ),
                test_admin,
            )
            writer_returned.set()
            await writer.commit()
        except BaseException:
            await writer.rollback()
            raise

    writer_task = asyncio.create_task(write_and_commit())
    try:
        async with asyncio.timeout(3):
            while writer_pid is None:
                await asyncio.sleep(0.01)
            while True:
                waiting_event_type = await db_session.scalar(
                    text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"),
                    {"pid": writer_pid},
                )
                if waiting_event_type == "Lock":
                    break
                await asyncio.sleep(0.01)
        returned_before_cancellation = writer_returned.is_set()
        flushed_before_cancellation = mutation_flushed.is_set()
        writer_task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await writer_task
    finally:
        if not writer_task.done():
            writer_task.cancel()
        try:
            await writer_task
        except BaseException:
            pass
        await writer.rollback()
        await blocker.rollback()
        event.remove(writer.sync_session, "after_flush", record_flush)
        await writer.close()
        await blocker.close()

    adjustment_count = await db_session.scalar(
        select(func.count(LedgerEntry.id)).where(
            LedgerEntry.student_id == test_student.id,
            LedgerEntry.reason_code == "WP07-CANCEL",
        )
    )
    assert not returned_before_cancellation
    assert not flushed_before_cancellation
    assert adjustment_count == 0

    recovery = FinanceService(db_session)
    await recovery.lock_student_accounts([test_student.id])


@pytest.mark.asyncio
async def test_timed_out_financial_writer_rolls_back_and_releases_waiting_student_lock(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
) -> None:
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    blocker = factory()
    writer = factory()
    await blocker.execute(select(User.id).where(User.id == test_student.id).with_for_update())
    writer_pid = (await writer.execute(text("SELECT pg_backend_pid()"))).scalar_one()
    writer_task = asyncio.create_task(
        FinanceService(writer).create_adjustment(
            AdjustmentCreatePayload(
                student_id=test_student.id,
                amount=Decimal("1.00"),
                reason_code="WP07-TIMEOUT",
            ),
            test_admin,
        )
    )
    try:
        async with asyncio.timeout(3):
            while True:
                waiting_event_type = await db_session.scalar(
                    text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"),
                    {"pid": writer_pid},
                )
                if waiting_event_type == "Lock":
                    break
                if writer_task.done():
                    await writer_task
                await asyncio.sleep(0.01)
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(0.1):
                await writer_task
    finally:
        if not writer_task.done():
            writer_task.cancel()
        try:
            await writer_task
        except BaseException:
            pass
        await writer.rollback()
        await blocker.rollback()
        await writer.close()
        await blocker.close()

    adjustment_count = await db_session.scalar(
        select(func.count(LedgerEntry.id)).where(
            LedgerEntry.student_id == test_student.id,
            LedgerEntry.reason_code == "WP07-TIMEOUT",
        )
    )
    assert adjustment_count == 0

    await FinanceService(db_session).lock_student_accounts([test_student.id])


@pytest.mark.asyncio
async def test_different_students_progress_while_one_account_is_locked(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
) -> None:
    other_student = User(
        email="wp07-independent-student@example.com",
        first_name="Independent",
        last_name="Student",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(other_student)
    await db_session.commit()
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    blocker = factory()
    await blocker.execute(select(User.id).where(User.id == test_student.id).with_for_update())

    async def write_other_student() -> None:
        async with factory() as writer:
            await FinanceService(writer).create_adjustment(
                AdjustmentCreatePayload(
                    student_id=other_student.id,
                    amount=Decimal("1.00"),
                    reason_code="WP07-INDEPENDENT",
                ),
                test_admin,
            )
            await writer.commit()

    try:
        async with asyncio.timeout(3):
            await write_other_student()
    finally:
        await blocker.rollback()
        await blocker.close()


@pytest.mark.asyncio
async def test_multi_account_locks_use_sorted_order_and_remain_held_until_commit(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    second_student = User(
        email="wp07-opposite-order-student@example.com",
        first_name="Opposite",
        last_name="Order",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    db_session.add(second_student)
    await db_session.commit()
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    sessions = [factory(), factory()]
    student_ids = [test_student.id, second_student.id]
    backend_pids = [
        (await session.execute(text("SELECT pg_backend_pid()"))).scalar_one()
        for session in sessions
    ]
    barrier = asyncio.Barrier(2)
    lock_ready = [asyncio.Event(), asyncio.Event()]
    release_commit = [asyncio.Event(), asyncio.Event()]
    committed = [asyncio.Event(), asyncio.Event()]

    async def acquire_and_hold(index: int, requested_ids: list[int]) -> None:
        await barrier.wait()
        await FinanceService(sessions[index]).lock_student_accounts(requested_ids)
        lock_ready[index].set()
        await release_commit[index].wait()
        await sessions[index].commit()
        committed[index].set()

    tasks = [
        asyncio.create_task(acquire_and_hold(0, student_ids)),
        asyncio.create_task(acquire_and_hold(1, list(reversed(student_ids)))),
    ]
    winner_index: int | None = None
    try:
        async with asyncio.timeout(3):
            ready_waits = [asyncio.create_task(event.wait()) for event in lock_ready]
            done, pending = await asyncio.wait(
                ready_waits, return_when=asyncio.FIRST_COMPLETED
            )
            winner_index = 0 if ready_waits[0] in done else 1
            loser_index = 1 - winner_index
            for pending_wait in pending:
                pending_wait.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

            while True:
                waiting_event_type = await db_session.scalar(
                    text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"),
                    {"pid": backend_pids[loser_index]},
                )
                if waiting_event_type == "Lock":
                    break
                assert not lock_ready[loser_index].is_set()
                await asyncio.sleep(0.01)

            release_commit[winner_index].set()
            await committed[winner_index].wait()
            await lock_ready[loser_index].wait()
            release_commit[loser_index].set()
            await asyncio.gather(*tasks)
    finally:
        for release in release_commit:
            release.set()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        for session in sessions:
            await session.rollback()
            await session.close()


@pytest.mark.asyncio
async def test_account_lock_acquisition_order_is_independent_of_physical_row_order(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    highest_user_id: int = (await db_session.scalar(select(func.max(User.id)))) or 0
    requested_ids: list[int] = [highest_user_id + 100, highest_user_id + 99]
    for student_id in requested_ids:
        db_session.add(
            User(
                id=student_id,
                email=f"wp07-lock-order-{student_id}@invalid.test",
                first_name="Lock",
                last_name="Order",
                role=UserRole.STUDENT,
                must_set_password=False,
            )
        )
        await db_session.flush()
    await db_session.commit()
    await db_session.execute(text("SET LOCAL enable_indexscan = off"))
    await db_session.execute(text("SET LOCAL enable_bitmapscan = off"))
    physical_order: list[int] = list(
        (
            await db_session.execute(select(User.id).where(User.id.in_(requested_ids)))
        ).scalars()
    )
    assert physical_order == requested_ids
    acquired_ids: list[int] = []
    execute_query = db_session.execute

    async def observe_acquired_rows(
        statement: Executable, *args: Any, **kwargs: Any
    ) -> Result[Any]:
        result = await execute_query(statement, *args, **kwargs)
        frozen_result = result.freeze()
        acquired_ids.extend(row[0] for row in frozen_result())
        return frozen_result()

    monkeypatch.setattr(db_session, "execute", observe_acquired_rows)
    await FinanceService(db_session).lock_student_accounts(requested_ids + requested_ids)
    assert acquired_ids == sorted(set(requested_ids))
