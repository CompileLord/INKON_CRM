from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.cache_generation import CacheGeneration
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.enrollment import WithdrawalPreviewResponse
from app.schemas.ledger import RefundPaymentPayload
from app.services.enrollment_service import EnrollmentService
from app.services.finance_service import FinanceService


async def create_scenario(session: AsyncSession, student: User, mentor: User) -> Enrollment:
    course: Course = Course(title="U18", description="Withdrawal", mentor_id=mentor.id,
                            price=Decimal("100.00"), start_date=date(2026, 1, 1),
                            end_date=date(2026, 5, 1), exam_type=CourseExamType.MONTHLY)
    session.add(course)
    await session.flush()
    enrollment: Enrollment = Enrollment(student_id=student.id, course_id=course.id,
        price_at_enrollment=Decimal("100.00"), color_hex="#000000", status=EnrollmentStatus.ACTIVE,
        enrolled_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    persistent_student: User | None = await session.get(User, student.id)
    assert persistent_student is not None
    persistent_student.payment_day_of_month = 20
    session.add(enrollment)
    await session.flush()
    await FinanceService(session).generate_schedule_for_enrollment(enrollment.id)
    return enrollment


@pytest.mark.asyncio
async def test_withdrawal_example_preview_credit_and_payment_cap(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(
        Charge.enrollment_id == enrollment.id).order_by(Charge.sequence_no))).all())
    payment: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.PAYMENT,
        amount=Decimal("200.00"), method=PaymentMethod.CASH,
        occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    db_session.add(payment)
    await db_session.flush()
    db_session.add_all([Allocation(ledger_entry_id=payment.id, charge_id=charges[0].id, amount=Decimal("100")),
                        Allocation(ledger_entry_id=payment.id, charge_id=charges[2].id, amount=Decimal("100"))])
    charges[0].status = ChargeStatus.SETTLED
    charges[2].status = ChargeStatus.SETTLED
    await db_session.flush()
    service: EnrollmentService = EnrollmentService(db_session)
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 3, 1)):
        preview: WithdrawalPreviewResponse = await service.preview_withdrawal(enrollment.id)
        assert preview.still_owed == Decimal("100.00")
        assert preview.cancelled_amount == Decimal("200.00")
        assert preview.months_cancelled == 2
        await service.withdraw_student(enrollment.id, test_admin.id)
    assert [charge.status for charge in charges] == [ChargeStatus.SETTLED, ChargeStatus.OPEN,
                                                      ChargeStatus.CANCELLED, ChargeStatus.CANCELLED]
    assert await FinanceService(db_session).get_unallocated_credit(test_student.id) == Decimal("100.00")
    assert await db_session.scalar(select(LedgerEntry.id).where(
        LedgerEntry.type == LedgerEntryType.WITHDRAWAL_REVERSAL,
        LedgerEntry.recorded_by_id == test_admin.id)) is not None
    with pytest.raises(HTTPException) as error:
        await FinanceService(db_session).create_payment(test_student.id, enrollment.course_id, Decimal("101"),
            datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    assert error.value.status_code == 422
    assert error.value.detail == "withdrawn_enrollment_payment_exceeds_debt"
    refund: LedgerEntry = await FinanceService(db_session).refund_payment(
        payment.id, RefundPaymentPayload(amount=Decimal("200.00"), reason_code="test"), test_admin,
    )
    assert refund.amount == Decimal("200.00")
    assert refund.is_cash_out is True


@pytest.mark.asyncio
async def test_withdrawal_preserves_started_month_with_future_due_date(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 2, 10)):
        preview: WithdrawalPreviewResponse = await EnrollmentService(db_session).preview_withdrawal(enrollment.id)
        assert preview.still_owed == Decimal("200.00")
        assert preview.cancelled_amount == Decimal("200.00")
        await EnrollmentService(db_session).withdraw_student(enrollment.id, test_admin.id)
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(
        Charge.enrollment_id == enrollment.id).order_by(Charge.sequence_no))).all())
    assert charges[1].due_date == date(2026, 2, 20)
    assert [charge.status for charge in charges] == [ChargeStatus.OPEN, ChargeStatus.OPEN,
                                                      ChargeStatus.CANCELLED, ChargeStatus.CANCELLED]


@pytest.mark.asyncio
@pytest.mark.parametrize("with_discount", [False, True])
async def test_withdrawal_discount_does_not_create_credit_and_debtor_total_drops(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
    with_discount: bool,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(
        Charge.enrollment_id == enrollment.id).order_by(Charge.sequence_no))).all())
    charges[2].due_date = date(2026, 2, 25)
    charges[3].due_date = date(2026, 2, 26)
    discount: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.DISCOUNT,
        amount=Decimal("50.00"), occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    if with_discount:
        db_session.add(discount)
        await db_session.flush()
        db_session.add(Allocation(ledger_entry_id=discount.id, charge_id=charges[2].id, amount=Decimal("50.00")))
    await db_session.flush()
    finance: FinanceService = FinanceService(db_session)
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 3, 1)):
        before: dict = await finance.get_debts({"student_id": test_student.id}, 1, 10)
        assert before["items"][0]["debt"] == (Decimal("350.00") if with_discount else Decimal("400.00"))
        await EnrollmentService(db_session).withdraw_student(enrollment.id, test_admin.id)
        after: dict = await finance.get_debts({"student_id": test_student.id}, 1, 10)
        assert after["items"][0]["debt"] == Decimal("200.00")
        analytics: dict = await finance.get_analytics(date(2026, 1, 1), date(2026, 5, 1))
        assert Decimal(analytics["net_receivable"]) == Decimal("200.00")
    assert await finance.get_unallocated_credit(test_student.id) == Decimal("0.00")


@pytest.mark.asyncio
@pytest.mark.parametrize("with_adjustment", [False, True])
async def test_withdrawal_plan_example_and_adjustment_does_not_become_credit(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
    with_adjustment: bool,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(
        Charge.enrollment_id == enrollment.id).order_by(Charge.sequence_no))).all())
    payment: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.PAYMENT,
        amount=Decimal("100.00"), method=PaymentMethod.CASH,
        occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    adjustment: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.ADJUSTMENT,
        amount=Decimal("20.00"), occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    db_session.add(payment)
    if with_adjustment:
        db_session.add(adjustment)
    await db_session.flush()
    db_session.add(Allocation(ledger_entry_id=payment.id, charge_id=charges[0].id, amount=Decimal("100.00")))
    if with_adjustment:
        db_session.add(Allocation(ledger_entry_id=adjustment.id, charge_id=charges[2].id, amount=Decimal("20.00")))
    charges[0].status = ChargeStatus.SETTLED
    await db_session.flush()
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 3, 1)):
        preview: WithdrawalPreviewResponse = await EnrollmentService(db_session).preview_withdrawal(enrollment.id)
        assert preview.still_owed == Decimal("100.00")
        assert preview.cancelled_amount == Decimal("200.00")
        await EnrollmentService(db_session).withdraw_student(enrollment.id, test_admin.id)
    assert [charge.status for charge in charges] == [ChargeStatus.SETTLED, ChargeStatus.OPEN,
                                                      ChargeStatus.CANCELLED, ChargeStatus.CANCELLED]
    finance: FinanceService = FinanceService(db_session)
    assert await finance.get_unallocated_credit(test_student.id) == Decimal("0.00")
    if with_adjustment:
        assert await finance._entry_available(adjustment) == Decimal("0.00")


@pytest.mark.asyncio
async def test_withdrawal_preview_endpoint_and_audit(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User,
    test_admin: User, test_accountant: User,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    enrollment_id: int = enrollment.id
    await db_session.commit()
    admin_headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    accountant_headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 3, 1)):
        denied: Response = await client.get(f"/api/v1/enrollments/{enrollment_id}/withdraw-preview", headers=accountant_headers)
        assert denied.status_code == 403
        response: Response = await client.get(f"/api/v1/enrollments/{enrollment_id}/withdraw-preview", headers=admin_headers)
        assert response.status_code == 200
        assert response.json() == {"still_owed": "200.00", "cancelled_amount": "200.00", "months_cancelled": 2}
        withdrawn: Response = await client.patch(f"/api/v1/enrollments/{enrollment_id}/withdraw", headers=admin_headers)
        assert withdrawn.status_code == 200
    rows: list[AuditLog] = list((await db_session.scalars(select(AuditLog).where(
        AuditLog.entity_type == "enrollment", AuditLog.entity_id == enrollment_id))).all())
    changes: dict[str, str | None] = {row.field_name: row.new_value for row in rows}
    assert changes["cancelled_amount"] == "200.00"
    assert changes["months_cancelled"] == "2"


@pytest.mark.asyncio
async def test_withdrawal_invalidates_analytics_generation(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    enrollment: Enrollment = await create_scenario(db_session, test_student, test_mentor)
    enrollment_id: int = enrollment.id
    await db_session.commit()
    before: int | None = await db_session.scalar(select(CacheGeneration.generation).where(
        CacheGeneration.key == "finance_analytics"))
    assert before is not None
    with patch("app.services.finance_service.get_dushanbe_today", return_value=date(2026, 3, 1)):
        await EnrollmentService(db_session).withdraw_student(enrollment_id, test_admin.id)
    after: int | None = await db_session.scalar(select(CacheGeneration.generation).where(
        CacheGeneration.key == "finance_analytics"))
    assert after == before + 1
