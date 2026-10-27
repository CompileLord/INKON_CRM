from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.charge import Charge
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.debt_reminder_notification import DebtReminderNotification
from app.models.enrollment import BillingMode, Enrollment
from app.models.journal import Journal
from app.models.user import User, UserRole
from app.services.finance_service import FinanceService, get_dushanbe_today
from app.services.journal_generation_service import JournalGenerationService

from app.tests.integration.grant_support import (
    CourseFixture,
    headers_for,
    create_course,
    create_student_user,
    enroll,
    charges_of,
    build_started_enrollment,
    ENROLLMENTS_URL,
)


@pytest.mark.asyncio
async def test_grant_enrollment_creates_no_charges_and_exposes_billing_mode(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 10, 150)
    response: Response = await enroll(client, test_admin, test_student, course, billing_mode="grant")
    assert response.status_code == 201
    assert response.json()["billing_mode"] == "grant"
    assert await charges_of(db_session, response.json()["id"]) == []
    persisted: Enrollment | None = await db_session.get(Enrollment, response.json()["id"])
    assert persisted is not None and persisted.billing_mode == BillingMode.GRANT


@pytest.mark.asyncio
async def test_default_enrollment_is_paid_and_null_billing_mode_is_treated_as_paid(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 10, 150)
    response: Response = await enroll(client, test_admin, test_student, course)
    assert response.status_code == 201
    assert response.json()["billing_mode"] == "paid"
    enrollment_id: int = response.json()["id"]
    assert len(await charges_of(db_session, enrollment_id)) > 0
    persisted: Enrollment | None = await db_session.get(Enrollment, enrollment_id)
    assert persisted is not None
    persisted.billing_mode = None
    await db_session.commit()
    listing: Response = await client.get(
        ENROLLMENTS_URL, params={"student_id": test_student.id}, headers=headers_for(test_admin),
    )
    assert listing.json()["items"][0]["billing_mode"] == "paid"


@pytest.mark.asyncio
async def test_grant_student_is_not_a_debtor_and_gets_no_reminder_by_telegram_or_sms(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 70, 200)
    test_student.parent_telegram_chat_id = 880001
    paying_student: User = await create_student_user(db_session, "payer@example.test")
    paying_student.parent_telegram_chat_id = 880002
    sms_grant_student: User = await create_student_user(db_session, "smsgrant@example.test")
    sms_grant_student.phone = "+992900000321"
    await db_session.commit()
    grant_response: Response = await enroll(client, test_admin, test_student, course, billing_mode="grant")
    sms_grant_response: Response = await enroll(client, test_admin, sms_grant_student, course, billing_mode="grant")
    paid_response: Response = await enroll(client, test_admin, paying_student, course)
    assert grant_response.status_code == sms_grant_response.status_code == paid_response.status_code == 201
    await db_session.execute(Charge.__table__.update().where(
        Charge.enrollment_id == paid_response.json()["id"]).values(due_date=get_dushanbe_today() - timedelta(days=5)))
    await db_session.commit()

    debts: Response = await client.get("/api/v1/finance/debts/", headers=headers_for(test_admin))
    debtor_ids: set[int] = {item["student"]["id"] for item in debts.json()["items"]}
    assert debtor_ids == {paying_student.id}
    assert debts.json()["items"][0]["billing_mode"] == "paid"

    reminders: Response = await client.post(
        "/api/v1/finance/debts/reminders",
        json={"student_ids": [test_student.id, sms_grant_student.id, paying_student.id]},
        headers=headers_for(test_admin),
    )
    outcomes: dict[int, str] = {item["student_id"]: item["outcome"] for item in reminders.json()["results"]}
    assert outcomes == {test_student.id: "no_debt", sms_grant_student.id: "no_debt", paying_student.id: "queued"}
    notified: list[int] = list((await db_session.scalars(select(DebtReminderNotification.student_id))).all())
    assert notified == [paying_student.id]


@pytest.mark.asyncio
async def test_custom_monthly_fee_is_used_for_every_month(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 5, 130, price="100.00")
    response: Response = await enroll(client, test_admin, test_student, course, price_at_enrollment="72.50")
    assert response.status_code == 201
    assert response.json()["price_at_enrollment"] == "72.50"
    charges: list[Charge] = await charges_of(db_session, response.json()["id"])
    assert len(charges) >= 3
    assert {charge.amount for charge in charges} == {Decimal("72.50")}
    audit_fields: set[str] = set((await db_session.scalars(select(AuditLog.field_name).where(
        AuditLog.entity_type == "enrollment", AuditLog.entity_id == response.json()["id"]))).all())
    assert {"billing_mode", "price_at_enrollment"} <= audit_fields


@pytest.mark.asyncio
@pytest.mark.parametrize("fee", ["0", "-5.00", "10.123", "abc"])
async def test_invalid_custom_fee_is_rejected(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User, fee: str,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 5, 130)
    response: Response = await enroll(client, test_admin, test_student, course, price_at_enrollment=fee)
    assert response.status_code == 422
    assert await db_session.scalar(select(func.count(Enrollment.id))) == 0


@pytest.mark.asyncio
async def test_analytics_exclude_grants_from_expected_revenue_but_roster_counts_include_them(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = get_dushanbe_today()
    course: CourseFixture = await create_course(db_session, test_mentor, 40, 220)
    other_student: User = await create_student_user(db_session, "granted@example.test")
    paid_enrollment: Enrollment = await build_started_enrollment(db_session, test_student, course)
    grant_enrollment: Enrollment = await build_started_enrollment(db_session, other_student, course)
    grant_enrollment_id: int = grant_enrollment.id
    paid_total: Decimal = sum(
        (charge.amount for charge in await charges_of(db_session, paid_enrollment.id)), Decimal("0"))
    grant_charge_count: int = len(await charges_of(db_session, grant_enrollment_id))
    assert paid_total == Decimal("100.00") * grant_charge_count
    window_start: date = course.start_date
    window_end: date = course.end_date
    finance: FinanceService = FinanceService(db_session)
    before: dict = await finance.get_analytics(window_start, window_end)
    assert Decimal(before["gross_contract_value"]) == paid_total * 2
    assert Decimal(before["billed_in_period"]) == paid_total * 2

    flagged: Enrollment | None = await db_session.get(Enrollment, grant_enrollment_id)
    assert flagged is not None
    flagged.billing_mode = BillingMode.GRANT
    await db_session.commit()
    after: dict = await FinanceService(db_session)._compute_analytics(window_start, window_end)
    assert Decimal(after["gross_contract_value"]) == paid_total
    assert Decimal(after["billed_in_period"]) == paid_total
    assert Decimal(after["billed_to_date"]) == Decimal(before["billed_to_date"])
    assert Decimal(after["net_receivable"]) == Decimal(before["net_receivable"])
    assert today >= window_start

    roster: Response = await client.get(
        f"/api/v1/enrollments/courses/{course.id}/roster", headers=headers_for(test_admin),
    )
    assert roster.status_code == 200
    assert roster.json()["active_count"] == 2
    assert roster.json()["total"] == 2
    modes: dict[int, str] = {item["student_id"]: item["billing_mode"] for item in roster.json()["items"]}
    assert modes == {test_student.id: "paid", other_student.id: "grant"}
    courses: Response = await client.get("/api/v1/courses/", headers=headers_for(test_admin))
    assert courses.status_code == 200
    assert [item["active_student_count"] for item in courses.json()["items"] if item["id"] == course.id] == [2]
    charges_listing: Response = await client.get(
        "/api/v1/finance/charges/", params={"student_id": other_student.id}, headers=headers_for(test_admin),
    )
    assert {item["billing_mode"] for item in charges_listing.json()["items"]} == {"grant"}


@pytest.mark.asyncio
async def test_billing_mode_never_appears_in_journal_responses(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = get_dushanbe_today()
    course: CourseFixture = await create_course(db_session, test_mentor, 20, 100)
    db_session.add(CourseSchedule(
        course_id=course.id, day_of_week=today.weekday(), time_start=time(10), time_end=time(11)))
    await db_session.commit()
    persisted_course: Course | None = await db_session.get(Course, course.id)
    assert persisted_course is not None
    journals: list[Journal] = await JournalGenerationService(db_session).generate_journals(persisted_course)
    assert journals
    journal_id: int = journals[0].id
    await db_session.commit()
    classmate: User = await create_student_user(db_session, "classmate@example.test")
    assert (await enroll(client, test_admin, test_student, course, billing_mode="grant")).status_code == 201
    assert (await enroll(client, test_admin, classmate, course)).status_code == 201
    served: list[tuple[UserRole, str]] = []
    for viewer in (test_admin, test_mentor, test_student, classmate):
        for suffix in ("", "/class"):
            response: Response = await client.get(
                f"/api/v1/journals/{journal_id}{suffix}", headers=headers_for(viewer))
            if response.status_code == 200:
                served.append((viewer.role, suffix))
                assert "billing_mode" not in response.text
                assert "grant" not in response.text.lower()
    assert (UserRole.SUPERADMIN, "") in served
    assert (UserRole.STUDENT, "/class") in served


@pytest.mark.asyncio
async def test_row_inserted_without_billing_mode_defaults_to_paid_in_the_database(
    db_session: AsyncSession, test_mentor: User, test_student: User,
) -> None:
    course: CourseFixture = await create_course(db_session, test_mentor, 5, 100)
    await db_session.execute(text(
        "INSERT INTO enrollments (student_id, course_id, price_at_enrollment, color_hex, is_deleted) "
        "VALUES (:student_id, :course_id, 10.00, '#111111', false)"
    ), {"student_id": test_student.id, "course_id": course.id})
    stored: str | None = await db_session.scalar(text("SELECT billing_mode FROM enrollments"))
    assert stored == "paid"
    column_nullable: str | None = await db_session.scalar(text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name = 'enrollments' AND column_name = 'billing_mode'"))
    assert column_nullable == "YES"
