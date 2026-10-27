from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import BillingMode, Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.ledger import VoidPaymentPayload
from app.schemas.payment import PaymentIdempotency, PaymentTargetInput
from app.services.finance_service import FinanceService


async def make_enrollment(session: AsyncSession, student: User, mentor: User, title: str, grant: bool = False) -> Enrollment:
    course: Course = Course(title=title, description=title, mentor_id=mentor.id, price=Decimal('100.00'),
        start_date=date(2026, 1, 1), end_date=date(2026, 3, 1), exam_type=CourseExamType.MONTHLY)
    session.add(course)
    await session.flush()
    enrollment: Enrollment = Enrollment(student_id=student.id, course_id=course.id, price_at_enrollment=Decimal('100.00'),
        color_hex='#000000', status=EnrollmentStatus.ACTIVE, enrolled_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        billing_mode=BillingMode.GRANT if grant else BillingMode.PAID)
    session.add(enrollment)
    await session.flush()
    await FinanceService(session).generate_schedule_for_enrollment(enrollment.id)
    return enrollment


@pytest.mark.asyncio
async def test_targeted_payment_void_receipt_and_audit(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    first: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'First')
    second: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Second')
    third: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Third')
    service: FinanceService = FinanceService(db_session)
    previous: LedgerEntry = await service.create_payment(test_student.id, third.course_id, Decimal('25.00'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin)
    previous_allocation: Allocation | None = await db_session.scalar(select(Allocation).where(Allocation.ledger_entry_id == previous.id))
    assert previous_allocation is not None
    targets: list[PaymentTargetInput] = [PaymentTargetInput(enrollment_id=first.id, amount='50.00'), PaymentTargetInput(enrollment_id=second.id, amount='75.00')]
    payment: LedgerEntry = await service.create_payment(test_student.id, None, Decimal('125.00'), datetime.now(timezone.utc), PaymentMethod.CASH, None, test_admin, targets)
    allocations: list[tuple[Allocation, Charge]] = list((await db_session.execute(select(Allocation, Charge).join(Charge, Charge.id == Allocation.charge_id).where(Allocation.ledger_entry_id == payment.id))).all())
    assert {charge.enrollment_id for _, charge in allocations} == {first.id, second.id}
    assert all(charge.enrollment_id != third.id for _, charge in allocations)
    receipt: dict = await service.get_payment_receipt(payment.id)
    assert {target['course_title'] for target in receipt['targets']} == {'First', 'Second'}
    await db_session.flush()
    audit: AuditLog | None = await db_session.scalar(select(AuditLog).where(AuditLog.entity_type == 'payment', AuditLog.entity_id == payment.id, AuditLog.field_name == 'targets'))
    assert audit is not None
    assert str(first.id) in str(audit.new_value)
    await service.void_payment(payment.id, VoidPaymentPayload(reason_code='test'), test_admin)
    assert all(allocation.reversed_by_entry_id is not None for allocation, _ in allocations)
    assert previous_allocation.reversed_by_entry_id is None


@pytest.mark.asyncio
async def test_target_validation_and_legacy(db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User) -> None:
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Paid')
    grant: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Grant', True)
    other: Enrollment = await make_enrollment(db_session, test_admin, test_mentor, 'Other student')
    service: FinanceService = FinanceService(db_session)
    now: datetime = datetime.now(timezone.utc)
    for targets, amount, code in [
        ([PaymentTargetInput(enrollment_id=enrollment.id, amount='1')], Decimal('2'), 'payment_target_sum_mismatch'),
        ([PaymentTargetInput(enrollment_id=enrollment.id, amount='201')], Decimal('201'), 'payment_target_exceeds_balance'),
        ([PaymentTargetInput(enrollment_id=grant.id, amount='1')], Decimal('1'), 'payment_target_exceeds_balance'),
        ([PaymentTargetInput(enrollment_id=other.id, amount='1')], Decimal('1'), 'invalid_payment_target'),
    ]:
        with pytest.raises(HTTPException) as error:
            await service.create_payment(test_student.id, None, amount, now, PaymentMethod.CASH, None, test_admin, targets)
        assert error.value.status_code == 422
        assert error.value.detail['code'] == code
        if targets[0].enrollment_id == grant.id:
            assert error.value.detail['maximum'] == '0.00'
        if amount == Decimal('201'):
            assert error.value.detail['maximum'] == '200.00'
    payment: LedgerEntry = await service.create_payment(test_student.id, enrollment.course_id, Decimal('50'), now, PaymentMethod.CASH, None, test_admin)
    assert (await service.get_payment_receipt(payment.id))['targets'][0]['enrollment_id'] == enrollment.id
    first: str = PaymentIdempotency.fingerprint(test_student.id, None, Decimal('1'), now, PaymentMethod.CASH, None, [PaymentTargetInput(enrollment_id=enrollment.id, amount='1')])
    second: str = PaymentIdempotency.fingerprint(test_student.id, None, Decimal('1'), now, PaymentMethod.CASH, None, [PaymentTargetInput(enrollment_id=grant.id, amount='1')])
    assert first != second
    pair: list[PaymentTargetInput] = [PaymentTargetInput(enrollment_id=enrollment.id, amount='1'), PaymentTargetInput(enrollment_id=grant.id, amount='2')]
    assert PaymentIdempotency.fingerprint(test_student.id, None, Decimal('3'), now, PaymentMethod.CASH, None, pair) == PaymentIdempotency.fingerprint(test_student.id, None, Decimal('3'), now, PaymentMethod.CASH, None, list(reversed(pair)))


@pytest.mark.asyncio
async def test_payment_options_and_roles(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, test_accountant: User) -> None:
    from app.core.security import create_access_token

    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Options')
    await db_session.commit()
    for user in (test_student, test_mentor):
        headers: dict[str, str] = {'Authorization': f'Bearer {create_access_token(user.id, user.role)}'}
        response: Response = await client.get(f'/api/v1/finance/students/{test_student.id}/payment-options', headers=headers)
        assert response.status_code == 403
        response = await client.post('/api/v1/finance/payments/', headers=headers, json={
            'student_id': test_student.id, 'amount': '50.00', 'paid_at': datetime.now(timezone.utc).isoformat(),
            'method': 'cash', 'targets': [{'enrollment_id': enrollment.id, 'amount': '50.00'}],
        })
        assert response.status_code == 403
    headers = {'Authorization': f'Bearer {create_access_token(test_accountant.id, test_accountant.role)}'}
    response = await client.get(f'/api/v1/finance/students/{test_student.id}/payment-options', headers=headers)
    assert response.status_code == 200
    assert response.json()['wallet_credit'] == '0.00'
    assert response.json()['enrollments'][0]['remaining_contract_maximum'] == '200.00'
    payload: dict = {'student_id': test_student.id, 'amount': '50.00', 'paid_at': datetime.now(timezone.utc).isoformat(),
                     'method': 'cash', 'targets': [{'enrollment_id': enrollment.id, 'amount': '50.00'}]}
    mismatch: dict = {**payload, 'amount': '51.00'}
    response = await client.post('/api/v1/finance/payments/', headers=headers, json=mismatch)
    assert response.status_code == 422
    assert response.json()['detail']['code'] == 'payment_target_sum_mismatch'
    excessive: dict = {**payload, 'amount': '201.00', 'targets': [{'enrollment_id': enrollment.id, 'amount': '201.00'}]}
    response = await client.post('/api/v1/finance/payments/', headers=headers, json=excessive)
    assert response.status_code == 422
    assert response.json()['detail']['maximum'] == '200.00'
    response = await client.post('/api/v1/finance/payments/', headers=headers, json=payload)
    assert response.status_code == 201
    assert response.json()['targets'][0]['course_title'] == 'Options'
