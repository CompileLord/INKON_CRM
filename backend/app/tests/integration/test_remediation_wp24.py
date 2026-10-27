from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException
from httpx import AsyncClient, Response
from pydantic import BaseModel, ValidationError
import pytest
from sqlalchemy import event, func, select
from sqlalchemy.engine import Connection, ExecutionContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.db.base import Base
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.course import CourseCreate
from app.schemas.ledger import AdjustmentCreatePayload, AllocationCreatePayload, DiscountCreatePayload, RefundPaymentPayload, StudentBalanceResponse
from app.schemas.payment import PaymentCreate
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService
from app.tests.conftest import test_engine


class MoneyRequests:
    MODELS: dict[str, type[BaseModel]] = {
        "payment": PaymentCreate, "refund": RefundPaymentPayload, "discount": DiscountCreatePayload,
        "adjustment": AdjustmentCreatePayload, "allocation": AllocationCreatePayload, "course": CourseCreate,
    }

    @staticmethod
    def payload(kind: str, amount: str) -> dict[str, object]:
        if kind == "course":
            return {
                "title": "Money boundary", "description": "Exact cents", "start_date": "2026-01-01", "end_date": "2026-01-02",
                "exam_type": "monthly", "price": amount, "mentor_id": 1,
                "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "11:00:00"}],
            }
        payload: dict[str, object] = {"amount": amount}
        if kind in {"payment", "discount", "adjustment", "allocation"}:
            payload["student_id"] = 1
        if kind == "payment":
            payload.update(course_id=1, paid_at="2026-01-01T00:00:00Z", method="cash")
        if kind in {"refund", "adjustment"}:
            payload["reason_code"] = "money-boundary"
        if kind == "allocation":
            payload["charge_id"] = 1
        return payload

    @staticmethod
    @contextmanager
    def capture_writes() -> Iterator[list[str]]:
        writes: list[str] = []

        def capture(connection: Connection, cursor: object, statement: str, parameters: object, context: ExecutionContext, executemany: bool) -> None:
            if statement.lstrip().split()[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
                writes.append(statement)

        event.listen(test_engine.sync_engine, "before_cursor_execute", capture)
        try:
            yield writes
        finally:
            event.remove(test_engine.sync_engine, "before_cursor_execute", capture)

    @staticmethod
    async def course(session: AsyncSession, mentor: User, price: str, months: int = 3) -> Course:
        course_start: date = date.today().replace(day=1)
        end_month_index: int = course_start.year * 12 + course_start.month - 1 + months - 1
        course_end: date = date(end_month_index // 12, end_month_index % 12 + 1, 28)
        course: Course = Course(
            title="Legacy contract", description="Prewrite validation", price=Decimal(price), mentor_id=mentor.id,
            start_date=course_start, end_date=course_end, exam_type=CourseExamType.MONTHLY,
        )
        session.add(course)
        await session.flush()
        session.add(CourseSchedule(course_id=course.id, day_of_week=1, time_start=time(10), time_end=time(11)))
        session.add(Journal(course_id=course.id, period_label="2026-01", period_start=date(2026, 1, 1), period_end=date(2026, 1, 31), period_type=JournalPeriodType.MONTH))
        await session.commit()
        return course


@pytest.mark.parametrize("kind", list(MoneyRequests.MODELS))
@pytest.mark.parametrize("amount", ["0.001", "1.005", "99999999.991", "100000000.00", "NaN", "Infinity", "-Infinity", "0", "-0.01"])
def test_money_inputs_reject_unpersistable_values(kind: str, amount: str) -> None:
    with pytest.raises(ValidationError):
        MoneyRequests.MODELS[kind].model_validate(MoneyRequests.payload(kind, amount))


@pytest.mark.parametrize("kind", list(MoneyRequests.MODELS))
@pytest.mark.parametrize("amount", ["0.01", "1", "1.2300", "99999999.99"])
def test_money_inputs_accept_exact_representable_values(kind: str, amount: str) -> None:
    payload: BaseModel = MoneyRequests.MODELS[kind].model_validate(MoneyRequests.payload(kind, amount))
    assert getattr(payload, "price" if kind == "course" else "amount") == Decimal(amount)


def test_optional_allocation_and_signed_large_responses_keep_their_domain() -> None:
    assert AllocationCreatePayload(student_id=1, charge_id=1).amount is None
    assert AllocationCreatePayload(student_id=1, charge_id=1, amount=None).amount is None
    balance: StudentBalanceResponse = StudentBalanceResponse(student_id=1, billed_to_date="999999999.99", total_settled="0", net_receivable="-1.23", credit_balance="1000000000.00", days_overdue=0)
    assert balance.net_receivable == Decimal("-1.23")
    assert balance.credit_balance == Decimal("1000000000.00")


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,path", [
    ("payment", "/finance/payments/"), ("refund", "/finance/payments/1/refund"),
    ("discount", "/finance/discounts/"), ("adjustment", "/finance/adjustments/"),
    ("allocation", "/finance/allocations/"), ("course", "/courses/"),
])
async def test_http_precision_validation_precedes_any_write(client: AsyncClient, test_admin: User, kind: str, path: str) -> None:
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    with MoneyRequests.capture_writes() as writes:
        response: Response = await client.post(f"/api/v1{path}", json=MoneyRequests.payload(kind, "1.005"), headers=headers)
    assert response.status_code == 422, response.text
    assert writes == []


@pytest.mark.asyncio
async def test_tiny_course_creation_is_rejected_before_course_journal_or_history_writes(client: AsyncClient, test_admin: User, test_mentor: User) -> None:
    payload: dict[str, object] = MoneyRequests.payload("course", "0.02")
    payload.update(mentor_id=test_mentor.id, end_date="2026-03-31")
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    with MoneyRequests.capture_writes() as writes:
        response: Response = await client.post("/api/v1/courses/", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    assert writes


@pytest.mark.asyncio
@pytest.mark.parametrize("price", ["0.00", "-0.01", "0.01", "0.02"])
async def test_legacy_course_rejection_precedes_enrollment_journal_and_charge_writes(
    db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User, price: str,
) -> None:
    course: Course = await MoneyRequests.course(db_session, test_mentor, price)
    if Decimal(price) > 0:
        enrollment: Enrollment = await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
        charges: list[Charge] = list(await db_session.scalars(select(Charge).where(Charge.enrollment_id == enrollment.id)))
        assert len(charges) == 3
        assert all(charge.amount == Decimal(price) for charge in charges)
        return
    with MoneyRequests.capture_writes() as writes:
        with pytest.raises(HTTPException) as caught:
            await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
    assert caught.value.status_code == 400
    assert writes == []
    assert db_session.is_active
    assert not db_session.new
    model: type[Base]
    for model in [Enrollment, JournalEntry, JournalStudentSummary, Charge]:
        assert await db_session.scalar(select(func.count()).select_from(model)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("price,months", [
    ("0.03", 3), ("0.04", 3), ("0.05", 3), ("0.05", 5), ("0.06", 4),
    ("1000.00", 3), ("99999999.99", 3),
])
async def test_monthly_charges_are_exact_positive_and_idempotent(
    db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User,
    price: str, months: int,
) -> None:
    course: Course = await MoneyRequests.course(db_session, test_mentor, price, months)
    enrollment: Enrollment = await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
    charges: list[Charge] = list(await db_session.scalars(select(Charge).where(Charge.enrollment_id == enrollment.id).order_by(Charge.sequence_no)))
    assert len(charges) == months
    assert all(charge.amount == Decimal(price) for charge in charges)
    assert all(charge.amount > 0 for charge in charges)
    assert sum((charge.amount for charge in charges), Decimal("0.00")) == Decimal(price) * months
    existing_ids: list[int] = [charge.id for charge in charges]
    assert [charge.id for charge in await FinanceService(db_session).generate_schedule_for_enrollment(enrollment.id)] == existing_ids
    await db_session.commit()
    assert await db_session.scalar(select(func.count()).select_from(Charge)) == months


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", ["0.001", "1.005", "100000000.00", "NaN", "Infinity"])
async def test_direct_payment_money_is_validated_before_writes(db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User, amount: str) -> None:
    course: Course = await MoneyRequests.course(db_session, test_mentor, "100.00")
    await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
    await db_session.commit()
    with MoneyRequests.capture_writes() as writes:
        with pytest.raises(HTTPException) as caught:
            await FinanceService(db_session).create_payment(test_student.id, course.id, Decimal(amount), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    assert caught.value.status_code == 400
    assert writes == []
    assert db_session.is_active


@pytest.mark.asyncio
@pytest.mark.parametrize("price", ["0.00", "0.01", "0.02"])
async def test_existing_enrollment_schedule_validation_precedes_charge_writes(
    db_session: AsyncSession, test_student: User, test_mentor: User, price: str,
) -> None:
    course: Course = await MoneyRequests.course(db_session, test_mentor, price)
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal(price), color_hex="#123456")
    db_session.add(enrollment)
    await db_session.commit()
    if Decimal(price) > 0:
        charges: list[Charge] = await FinanceService(db_session).generate_schedule_for_enrollment(enrollment.id)
        assert len(charges) == 3
        assert all(charge.amount == Decimal(price) for charge in charges)
        return
    with MoneyRequests.capture_writes() as writes:
        with pytest.raises(HTTPException) as caught:
            await FinanceService(db_session).generate_schedule_for_enrollment(enrollment.id)
    assert caught.value.status_code == 400
    assert writes == []
    assert db_session.is_active
    assert await db_session.scalar(select(func.count()).select_from(Charge)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("amount", ["0.01", "99999999.99"])
async def test_http_valid_payment_boundaries_persist_exactly(
    db_session: AsyncSession, client: AsyncClient, test_admin: User, test_student: User, test_mentor: User, amount: str,
) -> None:
    from app.models.ledger import LedgerEntry

    course: Course = await MoneyRequests.course(db_session, test_mentor, "100.00")
    await EnrollmentService(db_session).enroll_student(test_student.id, course.id, test_admin)
    await db_session.commit()
    payload: dict[str, object] = MoneyRequests.payload("payment", amount)
    payload.update(student_id=test_student.id, course_id=course.id, paid_at=datetime.now(timezone.utc).isoformat())
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    response: Response = await client.post("/api/v1/finance/payments/", json=payload, headers=headers)
    if amount == "99999999.99":
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "payment_target_exceeds_balance"
    else:
        assert response.status_code == 201, response.text
        assert response.json()["amount"] == amount
        assert await db_session.scalar(select(LedgerEntry.amount).where(LedgerEntry.id == response.json()["id"])) == Decimal(amount)
