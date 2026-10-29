from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.charge import Charge, ChargeStatus
from app.models.enrollment import BillingMode, Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.ledger import DiscountCreatePayload
from app.schemas.payment import PaymentTargetInput
from app.services.finance_service import FinanceService
from app.tests.integration.test_p7_targets import make_enrollment


@pytest.mark.asyncio
async def test_retained_debt_remains_payable(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    grant: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Retained grant')
    withdrawn: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Retained withdrawal')
    grant.billing_mode = BillingMode.GRANT
    withdrawn.status = EnrollmentStatus.WITHDRAWN
    await db_session.flush()
    service: FinanceService = FinanceService(db_session)
    options: dict = await service.get_payment_options(test_student.id)
    assert next(item for item in options['enrollments'] if item['enrollment_id'] == withdrawn.id)['status'] == EnrollmentStatus.WITHDRAWN
    for enrollment in (grant, withdrawn):
        payment: LedgerEntry = await service.create_payment(test_student.id, None, Decimal('10'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin, [PaymentTargetInput(enrollment_id=enrollment.id, amount='10')])
        assert payment.amount == Decimal('10')
    await service.create_payment(test_student.id, None, Decimal('190'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin, [PaymentTargetInput(enrollment_id=grant.id, amount='190')])
    with pytest.raises(HTTPException) as error:
        await service.create_payment(test_student.id, None, Decimal('1'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin, [PaymentTargetInput(enrollment_id=grant.id, amount='1')])
    assert error.value.detail['code'] == 'payment_target_exceeds_balance'
    assert error.value.detail['maximum'] == '0.00'


@pytest.mark.asyncio
async def test_discount_requires_open_charge(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    with pytest.raises(ValidationError):
        DiscountCreatePayload(student_id=test_student.id, amount=Decimal('1'))
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Discount')
    charge: Charge = (await db_session.scalars(select(Charge).where(Charge.enrollment_id == enrollment.id))).first()
    charge.status = ChargeStatus.CANCELLED
    await db_session.flush()
    with pytest.raises(HTTPException) as error:
        await FinanceService(db_session).create_discount(DiscountCreatePayload(student_id=test_student.id, charge_id=charge.id, amount=Decimal('1')), test_admin)
    assert error.value.status_code == 422
    assert error.value.detail['code'] == 'discount_charge_not_open'
    charge.status = ChargeStatus.SETTLED
    await db_session.flush()
    with pytest.raises(HTTPException) as settled_error:
        await FinanceService(db_session).create_discount(DiscountCreatePayload(student_id=test_student.id, charge_id=charge.id, amount=Decimal('1')), test_admin)
    assert settled_error.value.detail['code'] == 'discount_charge_not_open'


@pytest.mark.asyncio
async def test_accountant_can_refund(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, test_accountant: User) -> None:
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Refund')
    payment: LedgerEntry = await FinanceService(db_session).create_payment(test_student.id, enrollment.course_id, Decimal('10'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    await db_session.commit()
    headers: dict[str, str] = {'Authorization': f'Bearer {create_access_token(test_accountant.id, test_accountant.role)}'}
    response: Response = await client.post(f'/api/v1/finance/payments/{payment.id}/refund', headers=headers, json={'amount': '5.00', 'reason_code': 'test'})
    assert response.status_code == 200, response.text
    receipt: dict = await FinanceService(db_session).get_payment_receipt(payment.id)
    assert receipt['status'] == 'partially_refunded'
    assert receipt['refunded_amount'] == Decimal('5')
    assert receipt['net_amount'] == Decimal('5')
    response = await client.post(f'/api/v1/finance/payments/{payment.id}/refund', headers=headers, json={'amount': '5.00', 'reason_code': 'test'})
    assert response.status_code == 200, response.text
    receipt = await FinanceService(db_session).get_payment_receipt(payment.id)
    assert receipt['status'] == 'refunded'
    assert receipt['net_amount'] == Decimal('0')


@pytest.mark.asyncio
async def test_receipt_of_void_payment(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    from app.schemas.ledger import VoidPaymentPayload

    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Voided receipt')
    service: FinanceService = FinanceService(db_session)
    payment: LedgerEntry = await service.create_payment(test_student.id, enrollment.course_id, Decimal('10'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    await service.void_payment(payment.id, VoidPaymentPayload(reason_code='test'), test_admin)
    receipt: dict = await service.get_payment_receipt(payment.id)
    assert receipt['status'] == 'voided'
    assert receipt['refunded_amount'] == Decimal('0')
    assert receipt['net_amount'] == Decimal('0')


@pytest.mark.asyncio
async def test_enrollment_state_reloaded_after_account_lock(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, monkeypatch: pytest.MonkeyPatch) -> None:
    from sqlalchemy import update
    from app.services.enrollment_billing_service import EnrollmentBillingService
    from app.services.enrollment_service import EnrollmentService

    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Stale enrollment')
    original_lock = FinanceService.lock_student_accounts

    async def change_before_reload(service: FinanceService, student_ids: list[int]) -> None:
        await original_lock(service, student_ids)
        await db_session.execute(update(Enrollment).where(Enrollment.id == enrollment.id).values(status=EnrollmentStatus.WITHDRAWN).execution_options(synchronize_session=False))

    monkeypatch.setattr(FinanceService, 'lock_student_accounts', change_before_reload)
    with pytest.raises(HTTPException) as error:
        await EnrollmentBillingService(db_session).change_billing_mode(enrollment.id, BillingMode.GRANT, 'test', test_admin)
    assert error.value.status_code == 409 and error.value.detail == 'enrollment_not_active'
    enrollment.status = EnrollmentStatus.ACTIVE
    await db_session.flush()
    result: Enrollment = await EnrollmentService(db_session).withdraw_student(enrollment.id, test_admin.id)
    assert result.status == EnrollmentStatus.WITHDRAWN


@pytest.mark.asyncio
async def test_collection_rate_excludes_grant_payments(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    today = datetime.now(timezone.utc).date()
    first: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Paid collection')
    second: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Grant collection')
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(Charge.enrollment_id.in_([first.id, second.id])))).all())
    for charge in charges:
        charge.due_date = today
    await db_session.flush()
    service: FinanceService = FinanceService(db_session)
    for enrollment in (first, second):
        await service.create_payment(test_student.id, enrollment.course_id, Decimal('100'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    second.billing_mode = BillingMode.GRANT
    await db_session.flush()
    analytics: dict = await service._compute_analytics(today, today)
    assert Decimal(analytics['collection_rate']) == Decimal('0.5000')
    assert Decimal(analytics['collected_in_period']) == Decimal('200')


@pytest.mark.asyncio
async def test_deleting_withdrawn_student_advances_generation(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    from app.models.cache_generation import CacheGeneration
    from app.services.user_service import UserService

    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Deleted debtor')
    enrollment.status = EnrollmentStatus.WITHDRAWN
    await db_session.commit()
    before: int = (await db_session.scalar(select(CacheGeneration.generation).where(CacheGeneration.key == 'finance_analytics'))) or 0
    assert await UserService(db_session).delete_user(test_student.id, test_admin.id)
    after: int = (await db_session.scalar(select(CacheGeneration.generation).where(CacheGeneration.key == 'finance_analytics'))) or 0
    assert after > before
