from datetime import date, time, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.charge import Charge, ChargeStatus, ChargeType
from app.models.course import Course, CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery
from app.repositories.sqlalchemy.course_repository import SQLAlchemyCourseRepository
from app.repositories.sqlalchemy.enrollment_repository import SQLAlchemyEnrollmentRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.repositories.interfaces.enrollment_repository import RosterQueryResult
from app.services.enrollment_service import EnrollmentService
from app.services.journal_generation_service import JournalGenerationService
from app.services.journal_query_service import JournalQueryService
from app.services.user_service import UserService


@pytest.mark.asyncio
async def test_deleted_and_withdrawn_students_are_hidden_or_preserved_as_required(
    db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = date.today()
    course: Course = Course(
        title="B1 course", description="Roster regression", start_date=today - timedelta(days=20),
        end_date=today + timedelta(days=80), exam_type=CourseExamType.MONTHLY,
        price=Decimal("500.00"), mentor_id=test_mentor.id,
    )
    withdrawn_student: User = User(
        first_name="Past", last_name="Student", email="b1-past@example.test", role=UserRole.STUDENT,
    )
    persistent_student: User | None = await db_session.get(User, test_student.id)
    assert persistent_student is not None
    persistent_student.parent_telegram_chat_id = 123456789
    db_session.add_all([course, withdrawn_student])
    await db_session.flush()
    db_session.add(CourseSchedule(course_id=course.id, day_of_week=today.weekday(), time_start=time(10), time_end=time(11)))
    await db_session.flush()
    journals: list[Journal] = await JournalGenerationService(db_session).generate_journals(course)
    enrollment_service: EnrollmentService = EnrollmentService(db_session)
    deleted_enrollment: Enrollment = await enrollment_service.enroll_student(test_student.id, course.id, test_admin)
    withdrawn_enrollment: Enrollment = await enrollment_service.enroll_student(withdrawn_student.id, course.id, test_admin)
    future_charges: list[Charge] = list((await db_session.scalars(select(Charge).where(
        Charge.enrollment_id == deleted_enrollment.id, Charge.due_date > today,
    ))).all())
    assert future_charges
    balances_before: list[Any] = list((await db_session.execute(ChargeBalanceQuery().balances())).all())
    assert any(row.student_id == test_student.id for row in balances_before)
    await enrollment_service.withdraw_student(withdrawn_enrollment.id, test_admin.id)
    await UserService(db_session).delete_user(test_student.id, test_admin.id)
    assert deleted_enrollment.status == EnrollmentStatus.WITHDRAWN
    assert all(charge.status == ChargeStatus.CANCELLED for charge in future_charges)
    assert await db_session.scalar(select(AuditLog.id).where(
        AuditLog.entity_type == "enrollment", AuditLog.entity_id == deleted_enrollment.id,
        AuditLog.action == "update", AuditLog.field_name == "changed_fields", AuditLog.new_value == '["status"]',
    )) is not None
    roster_repo: SQLAlchemyEnrollmentRepository = SQLAlchemyEnrollmentRepository(db_session)
    roster: RosterQueryResult = await roster_repo.get_course_roster(course.id)
    assert [item.student_id for item in roster.items] == [withdrawn_student.id]
    assert roster.active_count == 0
    active_roster: RosterQueryResult = await roster_repo.get_course_roster(course.id, status=EnrollmentStatus.ACTIVE)
    assert active_roster.items == []
    withdrawn_roster: RosterQueryResult = await roster_repo.get_course_roster(course.id, status=EnrollmentStatus.WITHDRAWN)
    assert [item.student_id for item in withdrawn_roster.items] == [withdrawn_student.id]
    assert (await SQLAlchemyCourseRepository(db_session).count_active_students_by_course([course.id])).get(course.id, 0) == 0
    assert (await SQLAlchemyUserRepository(db_session).get_mentor_profile_stats(test_mentor.id))["active_students_count"] == 0
    balances_after: list[Any] = list((await db_session.execute(ChargeBalanceQuery().balances())).all())
    assert not any(row.student_id == test_student.id for row in balances_after)
    journal: dict[str, Any] = await JournalQueryService(db_session).get_journal(journals[0].id, test_admin)
    assert [student["student_id"] for student in journal["students"]] == [withdrawn_student.id]
    assert journal["students"][0]["entries"]


@pytest.mark.asyncio
async def test_student_deletion_withdraws_all_active_enrollments_only(
    db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    today: date = date.today()
    enrollments: list[Enrollment] = []
    charges: list[Charge] = []
    enrollment_status: EnrollmentStatus
    for enrollment_status in (EnrollmentStatus.ACTIVE, EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED):
        course: Course = Course(
            title="B1 multiple courses", description="Deletion orchestration", start_date=today,
            end_date=today + timedelta(days=90), exam_type=CourseExamType.MONTHLY,
            price=Decimal("500.00"), mentor_id=test_mentor.id,
        )
        db_session.add(course)
        await db_session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=test_student.id, course_id=course.id, price_at_enrollment=course.price,
            color_hex="#112233", status=enrollment_status,
        )
        db_session.add(enrollment)
        await db_session.flush()
        charge: Charge = Charge(
            enrollment_id=enrollment.id, student_id=test_student.id, sequence_no=1,
            amount=course.price, due_date=today + timedelta(days=10),
            status=ChargeStatus.OPEN, type=ChargeType.TUITION,
        )
        db_session.add(charge)
        enrollments.append(enrollment)
        charges.append(charge)
    await db_session.flush()

    await UserService(db_session).delete_user(test_student.id, test_admin.id)

    assert [enrollment.status for enrollment in enrollments] == [
        EnrollmentStatus.WITHDRAWN, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.COMPLETED,
    ]
    assert [charge.status for charge in charges] == [ChargeStatus.CANCELLED, ChargeStatus.CANCELLED, ChargeStatus.OPEN]
