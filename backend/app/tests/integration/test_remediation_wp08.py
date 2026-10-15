import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.ledger import RefundPaymentPayload, VoidPaymentPayload
from app.services.finance_service import FinanceService


async def seed_reversal_scenario(
    session: AsyncSession,
    student: User,
    mentor: User,
    administrator: User,
) -> tuple[int, int, int]:
    today: date = date.today()
    course = Course(
        title="WP08 reversal eligibility",
        description="Disposable financial reversal test data",
        start_date=today,
        end_date=today + timedelta(days=45),
        exam_type=CourseExamType.MONTHLY,
        price=Decimal("100.00"),
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
    charge = Charge(
        enrollment_id=enrollment.id,
        student_id=student.id,
        sequence_no=1,
        amount=Decimal("100.00"),
        due_date=today,
    )
    session.add(charge)
    payment = LedgerEntry(
        student_id=student.id,
        type=LedgerEntryType.PAYMENT,
        amount=Decimal("100.00"),
        method=PaymentMethod.CASH,
        occurred_at=datetime.now(timezone.utc),
        recorded_by_id=administrator.id,
    )
    session.add(payment)
    await session.flush()
    session.add(
        Allocation(
            ledger_entry_id=payment.id,
            charge_id=charge.id,
            amount=Decimal("60.00"),
        )
    )
    await session.commit()
    return payment.id, charge.id, enrollment.id


async def reversal_snapshot(
    session: AsyncSession,
    payment_id: int,
    charge_id: int,
) -> tuple[
    list[tuple[object, ...]],
    list[tuple[object, ...]],
    ChargeStatus,
    Decimal,
    list[tuple[object, ...]],
]:
    await session.flush()
    ledger_rows: list[tuple[object, ...]] = list(
        (
            await session.execute(
                select(
                    LedgerEntry.id,
                    LedgerEntry.type,
                    LedgerEntry.amount,
                    LedgerEntry.is_cash_out,
                    LedgerEntry.reverses_entry_id,
                )
                .where(
                    (LedgerEntry.id == payment_id)
                    | (LedgerEntry.reverses_entry_id == payment_id)
                )
                .order_by(LedgerEntry.id)
            )
        ).all()
    )
    allocation_rows: list[tuple[object, ...]] = list(
        (
            await session.execute(
                select(
                    Allocation.id,
                    Allocation.ledger_entry_id,
                    Allocation.amount,
                    Allocation.reversed_by_entry_id,
                )
                .where(
                    (Allocation.ledger_entry_id == payment_id)
                    | (Allocation.reversed_by_entry_id.in_(
                        select(LedgerEntry.id).where(LedgerEntry.reverses_entry_id == payment_id)
                    ))
                )
                .order_by(Allocation.id)
            )
        ).all()
    )
    charge: Charge | None = await session.get(Charge, charge_id)
    assert charge is not None
    audit_rows: list[tuple[object, ...]] = list(
        (
            await session.execute(
                select(
                    AuditLog.id,
                    AuditLog.action,
                    AuditLog.entity_type,
                    AuditLog.entity_id,
                    AuditLog.field_name,
                    AuditLog.old_value,
                    AuditLog.new_value,
                ).order_by(AuditLog.id)
            )
        ).all()
    )
    unallocated_credit: Decimal = await FinanceService(session).get_unallocated_credit(
        charge.student_id
    )
    return ledger_rows, allocation_rows, charge.status, unallocated_credit, audit_rows


@pytest.mark.parametrize("to_wallet", [False, True], ids=["cash", "wallet"])
@pytest.mark.parametrize("refund_amount", [Decimal("25.00"), Decimal("100.00")], ids=["partial", "full"])
@pytest.mark.asyncio
async def test_refunds_of_permitted_payment_preserve_cash_and_wallet_semantics(
    to_wallet: bool,
    refund_amount: Decimal,
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    payment_id, charge_id, _ = await seed_reversal_scenario(
        db_session, test_student, test_mentor, test_admin
    )

    await FinanceService(db_session).refund_payment(
        payment_id,
        RefundPaymentPayload(
            amount=refund_amount,
            reason_code="WP08-PERMITTED",
            to_wallet=to_wallet,
        ),
        test_admin,
    )
    await db_session.commit()

    refund = await db_session.scalar(
        select(LedgerEntry).where(
            LedgerEntry.reverses_entry_id == payment_id,
            LedgerEntry.type == LedgerEntryType.REFUND,
        )
    )
    assert refund is not None
    assert refund.amount == refund_amount
    assert refund.is_cash_out is (not to_wallet)
    assert refund.method is None if to_wallet else refund.method == PaymentMethod.CASH
    allocated = Decimal(
        await db_session.scalar(
            select(func.coalesce(func.sum(Allocation.amount), 0)).where(
                Allocation.ledger_entry_id == payment_id,
                Allocation.reversed_by_entry_id.is_(None),
            )
        )
    )
    assert allocated == Decimal("60.00") - min(refund_amount, Decimal("60.00"))
    unallocated_credit: Decimal = await FinanceService(db_session).get_unallocated_credit(
        test_student.id
    )
    expected_credit: Decimal = (
        Decimal("100.00") - allocated - (refund_amount if not to_wallet else Decimal("0.00"))
    )
    assert unallocated_credit == expected_credit
    refund_audit_rows: list[tuple[str, str, str | None]] = list(
        (
            await db_session.execute(
                select(AuditLog.action, AuditLog.field_name, AuditLog.new_value).where(
                    AuditLog.entity_type == "payment",
                    AuditLog.entity_id == payment_id,
                    AuditLog.action == "refund",
                )
            )
        ).all()
    )
    assert set(refund_audit_rows) == {
        ("refund", "amount", str(refund_amount)),
        ("refund", "reason_code", "WP08-PERMITTED"),
        ("refund", "destination", "wallet" if to_wallet else "cash"),
    }
    charge = await db_session.get(Charge, charge_id)
    assert charge is not None
    assert charge.status == ChargeStatus.OPEN


@pytest.mark.parametrize("to_wallet", [False, True], ids=["cash", "wallet"])
@pytest.mark.parametrize("refund_amount", [Decimal("25.00"), Decimal("100.00")], ids=["partial", "full"])
@pytest.mark.asyncio
async def test_refund_after_void_is_rejected_without_financial_or_audit_changes(
    to_wallet: bool,
    refund_amount: Decimal,
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    payment_id, charge_id, _ = await seed_reversal_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    await FinanceService(db_session).void_payment(
        payment_id, VoidPaymentPayload(reason_code="WP08-VOID-FIRST"), test_admin
    )
    await db_session.commit()
    before: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(
        db_session, payment_id, charge_id
    )

    with pytest.raises(HTTPException) as rejection:
        await FinanceService(db_session).refund_payment(
            payment_id,
            RefundPaymentPayload(
                amount=refund_amount,
                reason_code="WP08-REJECTED",
                to_wallet=to_wallet,
            ),
            test_admin,
        )
    assert rejection.value.status_code == 400
    during_rejection: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(
        db_session, payment_id, charge_id
    )
    assert during_rejection == before
    await db_session.rollback()
    after_rollback: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(db_session, payment_id, charge_id)
    assert after_rollback == before


@pytest.mark.parametrize("to_wallet", [False, True], ids=["cash", "wallet"])
@pytest.mark.parametrize("refund_amount", [Decimal("25.00"), Decimal("100.00")], ids=["partial", "full"])
@pytest.mark.asyncio
async def test_void_after_refund_is_rejected_without_financial_or_audit_changes(
    to_wallet: bool,
    refund_amount: Decimal,
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    payment_id, charge_id, _ = await seed_reversal_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    await FinanceService(db_session).refund_payment(
        payment_id,
        RefundPaymentPayload(
            amount=refund_amount,
            reason_code="WP08-REFUND-FIRST",
            to_wallet=to_wallet,
        ),
        test_admin,
    )
    await db_session.commit()
    before: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(
        db_session, payment_id, charge_id
    )

    with pytest.raises(HTTPException) as rejection:
        await FinanceService(db_session).void_payment(
            payment_id, VoidPaymentPayload(reason_code="WP08-REJECTED"), test_admin
        )
    assert rejection.value.status_code == 400
    during_rejection: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(
        db_session, payment_id, charge_id
    )
    assert during_rejection == before
    await db_session.rollback()
    after_rollback: tuple[
        list[tuple[object, ...]],
        list[tuple[object, ...]],
        ChargeStatus,
        Decimal,
        list[tuple[object, ...]],
    ] = await reversal_snapshot(db_session, payment_id, charge_id)
    assert after_rollback == before


async def wait_for_student_lock_wait(
    observer: AsyncSession,
    backend_pid: int,
    timeout_seconds: float = 5.0,
) -> None:
    async with asyncio.timeout(timeout_seconds):
        while True:
            waiting: bool = bool(
                await observer.scalar(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity "
                        "WHERE pid = :pid AND wait_event_type = 'Lock')"
                    ).bindparams(pid=backend_pid)
                )
            )
            if waiting:
                return
            await asyncio.sleep(0.01)


@pytest.mark.parametrize("first_operation", ["void", "refund"], ids=["void-first", "refund-first"])
@pytest.mark.parametrize("to_wallet", [False, True], ids=["cash", "wallet"])
@pytest.mark.asyncio
async def test_concurrent_void_and_refund_allow_only_the_first_committed_reversal(
    first_operation: str,
    to_wallet: bool,
    db_session: AsyncSession,
    test_student: User,
    test_mentor: User,
    test_admin: User,
) -> None:
    payment_id, charge_id, _ = await seed_reversal_scenario(
        db_session, test_student, test_mentor, test_admin
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    blocker: AsyncSession = session_factory()
    first_session: AsyncSession = session_factory()
    second_session: AsyncSession = session_factory()
    await blocker.execute(select(User.id).where(User.id == test_student.id).with_for_update())
    first_pid: int = int((await first_session.execute(text("SELECT pg_backend_pid()"))).scalar_one())
    second_pid: int = int((await second_session.execute(text("SELECT pg_backend_pid()"))).scalar_one())

    async def execute_reversal(
        session: AsyncSession,
        operation_name: str,
    ) -> bool:
        finance_service = FinanceService(session)
        try:
            if operation_name == "void":
                await finance_service.void_payment(
                    payment_id, VoidPaymentPayload(reason_code="WP08-RACE"), test_admin
                )
            else:
                await finance_service.refund_payment(
                    payment_id,
                    RefundPaymentPayload(
                        amount=Decimal("25.00"),
                        reason_code="WP08-RACE",
                        to_wallet=to_wallet,
                    ),
                    test_admin,
                )
            await session.commit()
            return True
        except HTTPException as exception:
            assert exception.status_code == 400
            await session.rollback()
            return False

    first_name: str = first_operation
    second_name: str = "refund" if first_operation == "void" else "void"
    first_task: asyncio.Task[bool] = asyncio.create_task(execute_reversal(first_session, first_name))
    second_task: asyncio.Task[bool] | None = None
    try:
        await wait_for_student_lock_wait(db_session, first_pid)
        second_task = asyncio.create_task(execute_reversal(second_session, second_name))
        await wait_for_student_lock_wait(db_session, second_pid)
        await blocker.commit()
        outcomes: list[bool] = await asyncio.gather(first_task, second_task)
    finally:
        if not first_task.done():
            first_task.cancel()
            await asyncio.gather(first_task, return_exceptions=True)
        if second_task is not None and not second_task.done():
            second_task.cancel()
            await asyncio.gather(second_task, return_exceptions=True)
        await blocker.rollback()
        await blocker.close()
        await first_session.close()
        await second_session.close()

    assert outcomes.count(True) == 1
    assert outcomes.count(False) == 1
    ledger_types: list[LedgerEntryType] = list(
        (
            await db_session.execute(
                select(LedgerEntry.type)
                .where(LedgerEntry.reverses_entry_id == payment_id)
                .order_by(LedgerEntry.id)
            )
        ).scalars()
    )
    assert ledger_types == [
        LedgerEntryType.VOID if first_operation == "void" else LedgerEntryType.REFUND
    ]
    reversal_total: Decimal = Decimal(
        await db_session.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(
                LedgerEntry.reverses_entry_id == payment_id
            )
        )
    )
    assert reversal_total == (Decimal("100.00") if first_operation == "void" else Decimal("25.00"))
    remaining_credit: Decimal = await FinanceService(db_session).get_unallocated_credit(
        test_student.id
    )
    expected_remaining_credit: Decimal = (
        Decimal("0.00")
        if first_operation == "void"
        else Decimal("65.00") if to_wallet else Decimal("40.00")
    )
    assert remaining_credit == expected_remaining_credit
    reversal_id: int = int(
        await db_session.scalar(
            select(LedgerEntry.id).where(LedgerEntry.reverses_entry_id == payment_id)
        )
    )
    audit_rows: list[tuple[str, str, str | None]] = list(
        (
            await db_session.execute(
                select(AuditLog.action, AuditLog.field_name, AuditLog.new_value).where(
                    AuditLog.entity_type == "payment",
                    AuditLog.entity_id == payment_id,
                    AuditLog.action.in_(["void", "refund"]),
                )
            )
        ).all()
    )
    expected_audit_rows: set[tuple[str, str, str | None]] = (
        {
            ("void", "reason_code", "WP08-RACE"),
            ("void", "void_entry_id", str(reversal_id)),
        }
        if first_operation == "void"
        else {
            ("refund", "amount", "25.00"),
            ("refund", "reason_code", "WP08-RACE"),
            ("refund", "destination", "wallet" if to_wallet else "cash"),
        }
    )
    assert len(audit_rows) == len(expected_audit_rows)
    assert set(audit_rows) == expected_audit_rows
    allocation_rows: list[tuple[Decimal, int | None]] = list(
        (
            await db_session.execute(
                select(Allocation.amount, Allocation.reversed_by_entry_id)
                .where(Allocation.ledger_entry_id == payment_id)
                .order_by(Allocation.id)
            )
        ).all()
    )
    expected_allocation_rows: list[tuple[Decimal, int | None]] = (
        [(Decimal("60.00"), reversal_id)]
        if first_operation == "void"
        else [(Decimal("60.00"), reversal_id), (Decimal("35.00"), None)]
    )
    assert allocation_rows == expected_allocation_rows
    charge: Charge | None = await db_session.get(Charge, charge_id)
    assert charge is not None
    assert charge.status == ChargeStatus.OPEN
