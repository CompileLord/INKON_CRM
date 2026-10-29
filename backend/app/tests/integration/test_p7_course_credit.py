from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.enrollment import Enrollment
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.user import User
from app.tests.integration.test_p7_targets import make_enrollment
from app.services.finance_service import FinanceService


@pytest.mark.asyncio
async def test_course_credit_allocation_and_errors(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, test_accountant: User) -> None:
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Credit course')
    other: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Other course')
    grant: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Grant course', True)
    foreign: Enrollment = await make_enrollment(db_session, test_admin, test_mentor, 'Foreign course')
    await db_session.commit()
    url: str = f'/api/v1/finance/students/{test_student.id}/credit-allocations'
    headers: dict[str, str] = {'Authorization': f'Bearer {create_access_token(test_accountant.id, test_accountant.role)}'}
    response: Response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'amount': 1})
    assert response.status_code == 422
    response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'extra': True})
    assert response.status_code == 422
    response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id})
    assert response.status_code == 422 and response.json()['detail']['code'] == 'no_wallet_credit'
    entry: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.ADJUSTMENT, amount=Decimal('300.00'), occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    db_session.add(entry)
    await db_session.commit()
    for target, amount, code, maximum in [(foreign.id, '1', 'invalid_payment_target', None), (grant.id, '1', 'nothing_to_allocate', None), (enrollment.id, '301', 'credit_exceeds_available', '300.00'), (enrollment.id, '201', 'payment_target_exceeds_balance', '200.00')]:
        response = await client.post(url, headers=headers, json={'enrollment_id': target, 'amount': amount})
        assert response.status_code == 422 and response.json()['detail']['code'] == code
        if maximum is not None:
            assert response.json()['detail']['maximum'] == maximum
    for user in (test_student, test_mentor):
        response = await client.post(url, headers={'Authorization': f'Bearer {create_access_token(user.id, user.role)}'}, json={'enrollment_id': enrollment.id})
        assert response.status_code == 403
    response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'amount': '150.00'})
    assert response.status_code == 201
    body: dict = response.json()
    assert body['allocated_amount'] == '150.00' and body['wallet_credit'] == '150.00'
    charges: list[Charge] = list((await db_session.scalars(select(Charge).where(Charge.enrollment_id == enrollment.id).order_by(Charge.due_date, Charge.id))).all())
    assert [item['charge_id'] for item in body['allocations']] == [charges[0].id, charges[1].id]
    assert [item['amount'] for item in body['allocations']] == ['100.00', '50.00']
    audit_response: Response = await client.get('/api/v1/audit-log/events/', headers={'Authorization': f'Bearer {create_access_token(test_admin.id, test_admin.role)}'}, params={'entity_type': 'allocation', 'search': f'{test_student.first_name} {test_student.last_name}'})
    assert audit_response.status_code == 200
    audit_events: list[dict] = audit_response.json()['items']
    allocation_event: dict = next(event for event in audit_events if event['entity_id'] == charges[0].id)
    assert allocation_event['student_id'] == test_student.id
    assert allocation_event['entity_label'] == f'{test_student.first_name} {test_student.last_name}'
    assert next(change['new_value'] for change in allocation_event['changes'] if change['field_name'] == 'allocated') == '150.00'
    other_allocations: list[Allocation] = list((await db_session.scalars(select(Allocation).join(Charge).where(Charge.enrollment_id == other.id))).all())
    assert not other_allocations
    response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id})
    assert response.status_code == 201
    assert response.json()['allocated_amount'] == '50.00' and response.json()['wallet_credit'] == '100.00'
    response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id})
    assert response.status_code == 422 and response.json()['detail']['code'] == 'nothing_to_allocate'


@pytest.mark.asyncio
async def test_credit_allocation_idempotency(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, test_accountant: User) -> None:
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Idempotent credit')
    entry: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.ADJUSTMENT, amount=Decimal('100.00'), occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id)
    db_session.add(entry)
    await db_session.commit()
    headers: dict[str, str] = {'Authorization': f'Bearer {create_access_token(test_accountant.id, test_accountant.role)}', 'Idempotency-Key': 'credit-retry'}
    url: str = f'/api/v1/finance/students/{test_student.id}/credit-allocations'
    first: Response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'amount': '25.00'})
    replay: Response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'amount': '25.00'})
    mismatch: Response = await client.post(url, headers=headers, json={'enrollment_id': enrollment.id, 'amount': '30.00'})
    assert first.status_code == 201, first.text
    assert replay.status_code == 200 and replay.json() == first.json()
    assert mismatch.status_code == 409 and mismatch.json()['detail']['code'] == 'idempotency_key_payload_mismatch'
    assert Decimal((await FinanceService(db_session).get_unallocated_credit(test_student.id))) == Decimal('75.00')


@pytest.mark.asyncio
async def test_course_credit_batches_availability(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User, monkeypatch: pytest.MonkeyPatch) -> None:
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, 'Batched credit')
    for _ in range(5):
        db_session.add(LedgerEntry(student_id=test_student.id, type=LedgerEntryType.ADJUSTMENT, amount=Decimal('10'), occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id))
    await db_session.flush()

    async def reject_per_entry_query(service: FinanceService, entry: LedgerEntry) -> Decimal:
        raise AssertionError('availability must be batched')

    monkeypatch.setattr(FinanceService, '_entry_available', reject_per_entry_query)
    result: dict = await FinanceService(db_session).allocate_course_credit(test_student.id, enrollment.id, Decimal('5'), test_admin)
    assert result['allocated_amount'] == Decimal('5')
    assert len(result['allocations']) == 1
