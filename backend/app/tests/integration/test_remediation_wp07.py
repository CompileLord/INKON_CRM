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


class LedgerRace:
    def __init__(self, session: AsyncSession, contenders: int = 2) -> None:
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            session.bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        self.barrier = asyncio.Barrier(contenders)
        self.connection_ids: set[int] = set()

    async def run(self, operation: Callable[[FinanceService], Awaitable[object]]) -> bool:
        async with self.session_factory() as session:
            connection_id: int = (await session.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            self.connection_ids.add(connection_id)
            await self.barrier.wait()
            try:
                await operation(FinanceService(session))
                await session.commit()
                return True
            except HTTPException as exception:
                await session.rollback()
                assert exception.status_code == 400
                return False


async def seed_ledger_scenario(
    session: AsyncSession,
    student: User,
    mentor: User,
    administrator: User,
    second_charge: bool = False,
) -> tuple[int, int, list[int]]:
    today: date = date.today()
    course = Course(
        title="WP07 ledger serialization",
        description="Disposable concurrency test data",
        start_date=today,
        end_date=today + timedelta(days=60),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("200.00" if second_charge else "100.00"),
        mentor_id=mentor.id,
    )
    session.add(course)
    await session.flush()
    enrollment = Enrollment(
        student_id=student.id,
        course_id=course.id,
        price_at_enrollment=course.price,
        color_hex="#000000",
    )
    session.add(enrollment)
    await session.flush()
    charge_ids: list[int] = []
    first_charge = Charge(
        enrollment_id=enrollment.id,
        student_id=student.id,
        sequence_no=1,
        amount=Decimal("100.00"),
        due_date=today,
    )
    session.add(first_charge)
    await session.flush()
    charge_ids.append(first_charge.id)
    if second_charge:
        second = Charge(
            enrollment_id=enrollment.id,
            student_id=student.id,
            sequence_no=2,
            amount=Decimal("100.00"),
            due_date=today + timedelta(days=30),
        )
        session.add(second)
        await session.flush()
        charge_ids.append(second.id)
    payment = LedgerEntry(
        student_id=student.id,
        type=LedgerEntryType.PAYMENT,
        amount=Decimal("100.00"),
        occurred_at=datetime.now(timezone.utc),
        recorded_by_id=administrator.id,
    )
    session.add(payment)
    await session.commit()
    return enrollment.id, payment.id, charge_ids


@pytest.mark.asyncio
async def test_concurrent_allocations_cannot_overfill_the_same_charge(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    _, payment_id, charge_ids = await seed_ledger_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    race = LedgerRace(db_session)

    async def allocate(finance_service: FinanceService) -> object:
        return await finance_service.allocate_credit(
            AllocationCreatePayload(
                student_id=test_student.id,
                charge_id=charge_ids[0],
                amount=Decimal("75.00"),
            ),
            test_admin,
        )

    results = await asyncio.gather(race.run(allocate), race.run(allocate))
    assert len(race.connection_ids) == 2
    assert sum(results) == 1
    allocated_to_charge = Decimal(
        (await db_session.execute(
            select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                Allocation.charge_id == charge_ids[0],
                Allocation.reversed_by_entry_id.is_(None),
            )
        )).scalar_one()
    )
    allocated_from_payment = Decimal(
        (await db_session.execute(
            select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                Allocation.ledger_entry_id == payment_id,
                Allocation.reversed_by_entry_id.is_(None),
            )
        )).scalar_one()
    )
    charge = await db_session.get(Charge, charge_ids[0])
    audit_count = await db_session.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.entity_type == "allocation",
            AuditLog.entity_id == charge_ids[0],
        )
    )

    assert allocated_to_charge == Decimal("75.00")
    assert allocated_from_payment == Decimal("75.00")
    assert charge is not None and charge.status == ChargeStatus.OPEN
    assert audit_count == 2


@pytest.mark.asyncio
async def test_concurrent_allocations_cannot_spend_one_credit_on_two_charges(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    _, payment_id, charge_ids = await seed_ledger_scenario(
        db_session, test_student, test_mentor, test_admin, second_charge=True
    )
    race = LedgerRace(db_session)

    async def allocate(charge_id: int) -> Callable[[FinanceService], Awaitable[object]]:
        async def operation(finance_service: FinanceService) -> object:
            return await finance_service.allocate_credit(
                AllocationCreatePayload(
                    student_id=test_student.id,
                    charge_id=charge_id,
                    amount=Decimal("75.00"),
                ),
                test_admin,
            )

        return operation

    results = await asyncio.gather(
        race.run(await allocate(charge_ids[0])),
        race.run(await allocate(charge_ids[1])),
    )
    assert len(race.connection_ids) == 2
    assert sum(results) == 1
    total_allocated = Decimal(
        (await db_session.execute(
            select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                Allocation.ledger_entry_id == payment_id,
                Allocation.reversed_by_entry_id.is_(None),
            )
        )).scalar_one()
    )
    assert total_allocated == Decimal("75.00")


@pytest.mark.asyncio
async def test_concurrent_refunds_cannot_exceed_payment_and_audit_only_commit_once(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    _, payment_id, _ = await seed_ledger_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    race = LedgerRace(db_session)

    async def refund(finance_service: FinanceService) -> object:
        return await finance_service.refund_payment(
            payment_id,
            RefundPaymentPayload(amount=Decimal("75.00"), reason_code="WP07", to_wallet=False),
            test_admin,
        )

    results = await asyncio.gather(race.run(refund), race.run(refund))
    assert len(race.connection_ids) == 2
    assert sum(results) == 1
    refund_total = Decimal(
        (await db_session.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
                LedgerEntry.reverses_entry_id == payment_id,
                LedgerEntry.type == LedgerEntryType.REFUND,
            )
        )).scalar_one()
    )
    refund_audit_count = await db_session.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.entity_type == "payment",
            AuditLog.entity_id == payment_id,
            AuditLog.action == "refund",
        )
    )

    assert refund_total == Decimal("75.00")
    assert refund_audit_count == 3


@pytest.mark.asyncio
async def test_concurrent_voids_create_only_one_reversal(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    _, payment_id, _ = await seed_ledger_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    race = LedgerRace(db_session)

    async def void(finance_service: FinanceService) -> object:
        return await finance_service.void_payment(
            payment_id, VoidPaymentPayload(reason_code="WP07"), test_admin
        )

    results = await asyncio.gather(race.run(void), race.run(void))
    assert len(race.connection_ids) == 2
    assert sum(results) == 1
    void_count = await db_session.scalar(
        select(func.count(LedgerEntry.id)).where(
            LedgerEntry.reverses_entry_id == payment_id,
            LedgerEntry.type == LedgerEntryType.VOID,
        )
    )
    assert void_count == 1


@pytest.mark.asyncio
async def test_database_rejects_duplicate_void_and_preserves_original_history(
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    _, payment_id, _ = await seed_ledger_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    original_void = await FinanceService(db_session).void_payment(
        payment_id, VoidPaymentPayload(reason_code="WP07-ORIGINAL"), test_admin
    )
    await db_session.commit()
    with pytest.raises(IntegrityError, match="uq_ledger_void_per_payment"):
        async with db_session.begin_nested():
            db_session.add(
                LedgerEntry(
                    student_id=test_student.id,
                    type=LedgerEntryType.VOID,
                    amount=Decimal("100.00"),
                    occurred_at=datetime.now(timezone.utc),
                    recorded_by_id=test_admin.id,
                    reverses_entry_id=payment_id,
                    reason_code="WP07-DUPLICATE",
                )
            )
            await db_session.flush()
    void_ids: list[int] = list(
        (
            await db_session.execute(
                select(LedgerEntry.id).where(
                    LedgerEntry.reverses_entry_id == payment_id,
                    LedgerEntry.type == LedgerEntryType.VOID,
                )
            )
        ).scalars()
    )
    assert void_ids == [original_void.id]


@pytest.mark.parametrize(
    "entrance_name",
    ["payment", "discount", "adjustment", "schedule_generation", "enrollment", "withdrawal"],
)
@pytest.mark.asyncio
async def test_financial_mutation_entrypoints_wait_for_student_lock_before_flush(
    entrance_name: str,
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    today = date.today()
    course = Course(
        title=f"WP07 {entrance_name}",
        description="Financial lock entrypoint regression",
        start_date=today,
        end_date=today + timedelta(days=45),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("100.00"),
        mentor_id=test_mentor.id,
    )
    db_session.add(course)
    await db_session.flush()

    enrollment: Enrollment | None = None
    if entrance_name != "enrollment":
        enrollment = Enrollment(
            student_id=test_student.id,
            course_id=course.id,
            price_at_enrollment=course.price,
            color_hex="#000000",
        )
        db_session.add(enrollment)
        await db_session.flush()

    charge: Charge | None = None
    if entrance_name in {"payment", "discount", "withdrawal"}:
        charge = Charge(
            enrollment_id=enrollment.id,
            student_id=test_student.id,
            sequence_no=1,
            amount=Decimal("100.00"),
            due_date=today + timedelta(days=30),
        )
        db_session.add(charge)
    await db_session.commit()

    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    blocker = factory()
    writer = factory()
    await blocker.execute(select(User.id).where(User.id == test_student.id).with_for_update())
    writer_pid = (await writer.execute(text("SELECT pg_backend_pid()"))).scalar_one()
    mutation_flushed = asyncio.Event()
    account_lock_query_started = asyncio.Event()

    def record_flush(session: object, flush_context: object) -> None:
        mutation_flushed.set()

    def record_account_lock_query(
        connection: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        normalized_statement = statement.upper()
        if "FOR UPDATE" in normalized_statement and "USERS" in normalized_statement:
            account_lock_query_started.set()

    event.listen(writer.sync_session, "after_flush", record_flush)
    engine = db_session.bind.sync_engine
    event.listen(engine, "before_cursor_execute", record_account_lock_query)

    async def run_mutation() -> object:
        if entrance_name == "adjustment":
            return await FinanceService(writer).create_adjustment(
                AdjustmentCreatePayload(
                    student_id=test_student.id,
                    amount=Decimal("10.00"),
                    reason_code="WP07-LOCK-ENTRANCE",
                ),
                test_admin,
            )
        if entrance_name == "payment":
            return await FinanceService(writer).create_payment(
                test_student.id,
                course.id,
                Decimal("10.00"),
                datetime.now(timezone.utc),
                PaymentMethod.CASH,
                None,
                test_admin,
            )
        if entrance_name == "discount":
            return await FinanceService(writer).create_discount(
                DiscountCreatePayload(
                    student_id=test_student.id,
                    charge_id=charge.id,
                    amount=Decimal("10.00"),
                    reason_code="WP07-LOCK-ENTRANCE",
                ),
                test_admin,
            )
        if entrance_name == "schedule_generation":
            return await FinanceService(writer).generate_schedule_for_enrollment(enrollment.id)
        if entrance_name == "enrollment":
            return await EnrollmentService(writer).enroll_student(
                test_student.id, course.id, test_admin
            )
        return await EnrollmentService(writer).withdraw_student(enrollment.id)

    mutation_task = asyncio.create_task(run_mutation())
    result: object | None = None
    try:
        async with asyncio.timeout(3):
            while True:
                if mutation_task.done():
                    await mutation_task
                    pytest.fail(f"{entrance_name} completed without waiting for the student lock")
                activity = (
                    await db_session.execute(
                        text("SELECT wait_event_type, query FROM pg_stat_activity WHERE pid = :pid"),
                        {"pid": writer_pid},
                    )
                ).one()
                if activity.wait_event_type == "Lock":
                    assert account_lock_query_started.is_set()
                    assert "SELECT" in activity.query.upper()
                    assert "USERS" in activity.query.upper()
                    break
                await asyncio.sleep(0.01)
        assert not mutation_flushed.is_set()
        await blocker.rollback()
        result = await mutation_task
        await writer.commit()
    finally:
        if not mutation_task.done():
            mutation_task.cancel()
        try:
            await mutation_task
        except BaseException:
            pass
        await writer.rollback()
        await blocker.rollback()
        event.remove(writer.sync_session, "after_flush", record_flush)
        event.remove(engine, "before_cursor_execute", record_account_lock_query)
        await writer.close()
        await blocker.close()

    if entrance_name == "payment":
        persisted_entry = await db_session.get(LedgerEntry, result.id)
        assert persisted_entry is not None
        assert persisted_entry.type == LedgerEntryType.PAYMENT
    elif entrance_name in {"discount", "adjustment"}:
        persisted_entry = await db_session.get(LedgerEntry, result.id)
        assert persisted_entry is not None
        assert persisted_entry.type == (
            LedgerEntryType.DISCOUNT if entrance_name == "discount" else LedgerEntryType.ADJUSTMENT
        )
    elif entrance_name == "schedule_generation":
        generated_charges = await db_session.scalar(
            select(func.count(Charge.id)).where(Charge.enrollment_id == enrollment.id)
        )
        assert generated_charges > 0
    elif entrance_name == "enrollment":
        persisted_enrollment = await db_session.scalar(
            select(Enrollment).where(
                Enrollment.student_id == test_student.id,
                Enrollment.course_id == course.id,
            )
        )
        assert persisted_enrollment is not None
        generated_charges = await db_session.scalar(
            select(func.count(Charge.id)).where(
                Charge.enrollment_id == persisted_enrollment.id
            )
        )
        assert generated_charges > 0
    else:
        persisted_enrollment = await db_session.get(Enrollment, enrollment.id)
        persisted_charge = await db_session.get(Charge, charge.id)
        assert persisted_enrollment is not None
        await db_session.refresh(persisted_enrollment)
        assert persisted_enrollment.status == EnrollmentStatus.WITHDRAWN
        assert persisted_charge is not None
        await db_session.refresh(persisted_charge)
        assert persisted_charge.status == ChargeStatus.CANCELLED


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


