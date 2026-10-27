from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.allocation import Allocation
from app.models.audit_log import AuditLog
from app.models.cache_generation import CacheGeneration
from app.models.charge import Charge, ChargeStatus
from app.models.enrollment import BillingMode, Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User
from app.services.finance_service import CourseMonthCalendar, FinanceService, get_dushanbe_today

from app.tests.integration.grant_support import (
    CourseFixture,
    headers_for,
    create_course,
    enroll,
    charges_of,
    build_started_enrollment,
    month_starts,
    ENROLLMENTS_URL,
    REASON,
)


@pytest.mark.asyncio
async def test_paid_to_grant_cancels_unpaid_future_months_and_writes_off_partly_paid_remainder(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = get_dushanbe_today()
    course: CourseFixture = await create_course(db_session, test_mentor, 40, 220)
    enrollment: Enrollment = await build_started_enrollment(db_session, test_student, course)
    enrollment_id: int = enrollment.id
    charges: list[Charge] = await charges_of(db_session, enrollment_id)
    starts: list[date] = month_starts(course)
    started: list[Charge] = [charge for charge, start in zip(charges, starts) if start < today]
    future: list[Charge] = [charge for charge, start in zip(charges, starts) if start >= today]
    assert len(started) >= 2 and len(future) >= 3
    partly_paid_id: int = future[0].id
    fully_paid_id: int = future[1].id
    started_due: Decimal = sum((charge.amount for charge in started if charge.due_date <= today), Decimal("0"))
    started_count: int = len(started)
    total_count: int = len(charges)
    payment: LedgerEntry = LedgerEntry(
        student_id=test_student.id, type=LedgerEntryType.PAYMENT, amount=Decimal("140.00"),
        method=PaymentMethod.CASH, occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id,
    )
    db_session.add(payment)
    await db_session.flush()
    payment_id: int = payment.id
    db_session.add_all([
        Allocation(ledger_entry_id=payment_id, charge_id=partly_paid_id, amount=Decimal("40.00")),
        Allocation(ledger_entry_id=payment_id, charge_id=fully_paid_id, amount=Decimal("100.00")),
    ])
    future[1].status = ChargeStatus.SETTLED
    await db_session.commit()
    cancelled_expected: int = len(future) - 2
    generation_before: int | None = await db_session.scalar(select(CacheGeneration.generation).where(
        CacheGeneration.key == "finance_analytics"))

    denied: Response = await client.patch(
        f"/api/v1/enrollments/{enrollment_id}/billing-mode",
        json={"billing_mode": "grant", "reason": REASON}, headers=headers_for(test_mentor),
    )
    assert denied.status_code == 403
    response: Response = await client.patch(
        f"/api/v1/enrollments/{enrollment_id}/billing-mode",
        json={"billing_mode": "grant", "reason": f"  {REASON}  "}, headers=headers_for(test_admin),
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    assert body["enrollment"]["billing_mode"] == "grant"
    assert body["cancelled_months"] == cancelled_expected
    assert Decimal(body["cancelled_amount"]) == Decimal("100.00") * cancelled_expected
    assert Decimal(body["written_off_amount"]) == Decimal("60.00")
    assert body["generated_months"] == 0

    after: list[Charge] = await charges_of(db_session, enrollment_id)
    assert [charge.status for charge in after[:started_count]] == [ChargeStatus.OPEN] * started_count
    by_id: dict[int, Charge] = {charge.id: charge for charge in after}
    assert by_id[partly_paid_id].status == ChargeStatus.SETTLED
    assert by_id[fully_paid_id].status == ChargeStatus.SETTLED
    assert all(charge.status == ChargeStatus.CANCELLED for charge in after[started_count + 2:])

    partly_paid_allocations: list[Allocation] = list((await db_session.scalars(select(Allocation).where(
        Allocation.charge_id == partly_paid_id, Allocation.reversed_by_entry_id.is_(None)))).all())
    assert sum((allocation.amount for allocation in partly_paid_allocations), Decimal("0")) == Decimal("100.00")
    assert any(
        allocation.ledger_entry_id == payment_id and allocation.amount == Decimal("40.00")
        for allocation in partly_paid_allocations
    )
    write_off: LedgerEntry = (await db_session.scalars(select(LedgerEntry).where(
        LedgerEntry.type == LedgerEntryType.DISCOUNT))).one()
    assert write_off.amount == Decimal("60.00")
    assert write_off.comment == REASON
    assert write_off.recorded_by_id == test_admin.id
    reversals: int = await db_session.scalar(select(func.count(LedgerEntry.id)).where(
        LedgerEntry.type == LedgerEntryType.WITHDRAWAL_REVERSAL)) or 0
    assert reversals == 0
    assert await FinanceService(db_session).get_unallocated_credit(test_student.id) == Decimal("0.00")

    debts: dict = await FinanceService(db_session).get_debts({"student_id": test_student.id}, 1, 10)
    assert debts["items"][0]["debt"] == started_due
    assert debts["items"][0]["billing_mode"] == BillingMode.GRANT

    enrollment_audit: dict[str, tuple[str | None, str | None, int | None]] = {
        row.field_name: (row.old_value, row.new_value, row.user_id) for row in (await db_session.scalars(
            select(AuditLog).where(AuditLog.entity_type == "enrollment", AuditLog.entity_id == enrollment_id)
        )).all() if row.field_name is not None
    }
    assert enrollment_audit["billing_mode"] == ("paid", "grant", test_admin.id)
    assert enrollment_audit["billing_mode_reason"][1] == REASON
    assert enrollment_audit["written_off_amount"][1] == "60.00"
    assert await db_session.scalar(select(func.count(func.distinct(AuditLog.entity_id))).where(
        AuditLog.entity_type == "discount", AuditLog.user_id == test_admin.id)) == 1
    generation_after: int | None = await db_session.scalar(select(CacheGeneration.generation).where(
        CacheGeneration.key == "finance_analytics"))
    assert generation_before is not None and generation_after is not None and generation_after > generation_before

    back: Response = await client.patch(
        f"/api/v1/enrollments/{enrollment_id}/billing-mode",
        json={"billing_mode": "paid", "reason": "Scholarship ended"}, headers=headers_for(test_admin),
    )
    assert back.status_code == 200
    assert back.json()["generated_months"] == cancelled_expected
    regenerated: list[Charge] = [charge for charge in await charges_of(db_session, enrollment_id)
                                 if charge.status != ChargeStatus.CANCELLED]
    assert sorted(charge.sequence_no for charge in regenerated) == list(range(1, total_count + 1))


@pytest.mark.asyncio
async def test_grant_to_paid_generates_only_from_the_next_course_month(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = get_dushanbe_today()
    course: CourseFixture = await create_course(db_session, test_mentor, 40, 220)
    enrollment: Enrollment = Enrollment(
        student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal("65.00"), color_hex="#000000",
        status=EnrollmentStatus.ACTIVE, billing_mode=BillingMode.GRANT,
        enrolled_at=datetime.combine(course.start_date, time.min, tzinfo=timezone.utc),
    )
    db_session.add(enrollment)
    await db_session.commit()
    enrollment_id: int = enrollment.id
    assert await charges_of(db_session, enrollment_id) == []
    starts: list[date] = month_starts(course)
    next_starts: list[date] = [start for start in starts if start > today]
    assert len(next_starts) >= 3 and len(next_starts) < len(starts)

    response: Response = await client.patch(
        f"/api/v1/enrollments/{enrollment_id}/billing-mode",
        json={"billing_mode": "paid", "reason": "Grant period over"}, headers=headers_for(test_admin),
    )
    assert response.status_code == 200, response.text
    assert response.json()["enrollment"]["billing_mode"] == "paid"
    assert response.json()["generated_months"] == len(next_starts)
    charges: list[Charge] = await charges_of(db_session, enrollment_id)
    first_new_sequence: int = len(starts) - len(next_starts) + 1
    assert [charge.sequence_no for charge in charges] == list(range(first_new_sequence, len(starts) + 1))
    assert {charge.amount for charge in charges} == {Decimal("65.00")}
    for charge, start in zip(charges, next_starts):
        following: date = CourseMonthCalendar.start(course.start_date, charge.sequence_no)
        assert start <= charge.due_date < following
        assert charge.status == ChargeStatus.OPEN
    audit_rows: dict[str, tuple[str | None, str | None]] = {
        row.field_name: (row.old_value, row.new_value) for row in (await db_session.scalars(
            select(AuditLog).where(AuditLog.entity_type == "enrollment", AuditLog.entity_id == enrollment_id)
        )).all() if row.field_name is not None
    }
    assert audit_rows["billing_mode"] == ("grant", "paid")
    assert audit_rows["billing_mode_reason"][1] == "Grant period over"
    assert audit_rows["generated_months"][1] == str(len(next_starts))


@pytest.mark.asyncio
async def test_transitions_require_reason_admin_role_and_a_real_change(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_accountant: User,
    test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 10, 150)
    created: Response = await enroll(client, test_admin, test_student, course)
    url: str = f"/api/v1/enrollments/{created.json()['id']}/billing-mode"
    for blank in ({"billing_mode": "grant"}, {"billing_mode": "grant", "reason": ""}, {"billing_mode": "grant", "reason": "   "}):
        assert (await client.patch(url, json=blank, headers=headers_for(test_admin))).status_code == 422
    assert (await client.patch(
        url, json={"billing_mode": "grant", "reason": "x", "extra": 1}, headers=headers_for(test_admin),
    )).status_code == 422
    for outsider in (test_mentor, test_accountant, test_student):
        assert (await client.patch(
            url, json={"billing_mode": "grant", "reason": REASON}, headers=headers_for(outsider),
        )).status_code == 403
    unchanged: Response = await client.patch(
        url, json={"billing_mode": "paid", "reason": REASON}, headers=headers_for(test_admin),
    )
    assert unchanged.status_code == 409
    assert unchanged.json()["detail"] == "billing_mode_unchanged"
    persisted: Enrollment | None = await db_session.get(Enrollment, created.json()["id"])
    await db_session.refresh(persisted)
    assert persisted is not None and persisted.billing_mode == BillingMode.PAID
    withdrawn: Response = await client.patch(
        f"/api/v1/enrollments/{created.json()['id']}/withdraw", headers=headers_for(test_admin),
    )
    assert withdrawn.status_code == 200
    inactive: Response = await client.patch(
        url, json={"billing_mode": "grant", "reason": REASON}, headers=headers_for(test_admin),
    )
    assert inactive.status_code == 409
    assert inactive.json()["detail"] == "enrollment_not_active"
    missing: Response = await client.patch(
        "/api/v1/enrollments/999999/billing-mode", json={"billing_mode": "grant", "reason": REASON},
        headers=headers_for(test_admin),
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_preview_matches_what_enrolling_creates_and_writes_nothing(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 12, 140, price="100.00")
    test_student.payment_day_of_month = 9
    await db_session.commit()
    payload: dict[str, Any] = {"student_id": test_student.id, "course_id": course.id, "price_at_enrollment": "80.00"}
    denied: Response = await client.post(
        f"{ENROLLMENTS_URL}preview", json=payload, headers=headers_for(test_mentor))
    assert denied.status_code == 403
    preview: Response = await client.post(f"{ENROLLMENTS_URL}preview", json=payload, headers=headers_for(test_admin))
    assert preview.status_code == 200, preview.text
    assert await db_session.scalar(select(func.count(Enrollment.id))) == 0
    assert await db_session.scalar(select(func.count(Charge.id))) == 0

    created: Response = await enroll(client, test_admin, test_student, course, price_at_enrollment="80.00")
    assert created.status_code == 201
    charges: list[Charge] = await charges_of(db_session, created.json()["id"])
    body: dict[str, Any] = preview.json()
    assert body["billing_mode"] == "paid"
    assert body["billed_months"] == len(charges)
    assert Decimal(body["total_amount"]) == sum((charge.amount for charge in charges), Decimal("0"))
    assert Decimal(body["first_charge"]["amount"]) == charges[0].amount == Decimal("80.00")
    assert body["first_charge"]["due_date"] == charges[0].due_date.isoformat()
    assert date.fromisoformat(body["first_charge"]["period_start"]) <= get_dushanbe_today()
    assert date.fromisoformat(body["first_charge"]["due_date"]) >= get_dushanbe_today()

    again: Response = await client.post(f"{ENROLLMENTS_URL}preview", json=payload, headers=headers_for(test_admin))
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_preview_for_a_grant_has_zero_billed_months_and_rejects_ended_courses(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 12, 140)
    grant_preview: Response = await client.post(
        f"{ENROLLMENTS_URL}preview",
        json={"student_id": test_student.id, "course_id": course.id, "billing_mode": "grant"},
        headers=headers_for(test_admin),
    )
    assert grant_preview.status_code == 200
    assert grant_preview.json()["billed_months"] == 0
    assert grant_preview.json()["first_charge"] is None
    assert Decimal(grant_preview.json()["total_amount"]) == Decimal("0")
    ended: CourseFixture = await create_course(db_session, test_mentor, 60, 30)
    rejected: Response = await client.post(
        f"{ENROLLMENTS_URL}preview", json={"student_id": test_student.id, "course_id": ended.id},
        headers=headers_for(test_admin),
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "course_already_ended"
    bad_fee: Response = await client.post(
        f"{ENROLLMENTS_URL}preview",
        json={"student_id": test_student.id, "course_id": course.id, "price_at_enrollment": "0"},
        headers=headers_for(test_admin),
    )
    assert bad_fee.status_code == 422
