from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.allocation import Allocation
from app.models.charge import Charge
from app.models.course import Course, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.user import User
from app.schemas.ledger import AdjustmentCreatePayload
from app.services.finance_service import FinanceService


@pytest.mark.asyncio
async def test_schedule_does_not_spend_existing_wallet_credit(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    payment: LedgerEntry = LedgerEntry(
        student_id=test_student.id, type=LedgerEntryType.PAYMENT, amount=Decimal('100.00'),
        method=PaymentMethod.CASH, occurred_at=datetime.now(timezone.utc), recorded_by_id=test_admin.id,
    )
    course: Course = Course(
        title='Wallet test', description='Wallet test', mentor_id=test_mentor.id,
        price=Decimal('100.00'), start_date=date(2026, 1, 1), end_date=date(2026, 3, 1),
        exam_type=CourseExamType.MONTHLY,
    )
    db_session.add_all([payment, course])
    await db_session.flush()
    enrollment: Enrollment = Enrollment(
        student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal('100.00'),
        color_hex='#000000', status=EnrollmentStatus.ACTIVE,
        enrolled_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(enrollment)
    await db_session.flush()
    service: FinanceService = FinanceService(db_session)
    charges: list[Charge] = await service.generate_schedule_for_enrollment(enrollment.id)
    assert charges
    assert await service.get_unallocated_credit(test_student.id) == Decimal('100.00')
    assert await db_session.scalar(select(func.count(Allocation.id)).where(Allocation.ledger_entry_id == payment.id)) == 0


@pytest.mark.asyncio
async def test_adjustment_does_not_spend_credit_on_open_charges(
    db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course = Course(
        title='Adjustment test', description='Adjustment test', mentor_id=test_mentor.id,
        price=Decimal('100.00'), start_date=date(2026, 1, 1), end_date=date(2026, 3, 1),
        exam_type=CourseExamType.MONTHLY,
    )
    db_session.add(course)
    await db_session.flush()
    enrollment: Enrollment = Enrollment(
        student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal('100.00'),
        color_hex='#000000', status=EnrollmentStatus.ACTIVE,
        enrolled_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(enrollment)
    await db_session.flush()
    service: FinanceService = FinanceService(db_session)
    assert await service.generate_schedule_for_enrollment(enrollment.id)
    adjustment: LedgerEntry = await service.create_adjustment(
        AdjustmentCreatePayload(student_id=test_student.id, amount=Decimal('50.00'), reason_code='test'), test_admin,
    )
    assert await service.get_unallocated_credit(test_student.id) == Decimal('50.00')
    assert await db_session.scalar(select(func.count(Allocation.id)).where(Allocation.ledger_entry_id == adjustment.id)) == 0
