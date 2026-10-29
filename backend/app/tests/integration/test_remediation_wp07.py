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
    blocker_pid: int = (await blocker.execute(text("SELECT pg_backend_pid()"))).scalar_one()
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
                writer_blocking_pids: list[int] = (
                    await db_session.execute(
                        text("SELECT pg_blocking_pids(:pid)"),
                        {"pid": writer_pid},
                    )
                ).scalar_one()
                if writer_blocking_pids:
                    assert account_lock_query_started.is_set()
                    assert writer_blocking_pids == [blocker_pid]
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


