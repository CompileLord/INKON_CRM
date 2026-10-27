from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.allocation import Allocation
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.payment import PaymentMethod
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.dashboard_attention_repository import DashboardAttentionRepository
from app.services.dashboard_attention_service import DashboardAttentionService, SchoolClock
from app.schemas.dashboard_attention import DashboardAttentionResponse


class FixedClock(SchoolClock):
    def now(self) -> datetime:
        return datetime(2026, 10, 27, 10, 10, tzinfo=ZoneInfo('Asia/Dushanbe'))


@pytest.mark.asyncio
async def test_dashboard_attention(db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    today: date = date(2026, 10, 27)
    course: Course = Course(title='Course', description='Course', mentor_id=test_mentor.id, price=Decimal('100'),
        start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), exam_type=CourseExamType.MONTHLY)
    db_session.add(course)
    await db_session.flush()
    schedule: CourseSchedule = CourseSchedule(course_id=course.id, day_of_week=today.weekday(), time_start=time(10, 1), time_end=time(11))
    journal: Journal = Journal(course_id=course.id, period_label='Period', period_start=date(2026, 1, 1),
        period_end=date(2026, 12, 31), period_type=JournalPeriodType.MONTH)
    enrollment: Enrollment = Enrollment(student_id=test_student.id, course_id=course.id, price_at_enrollment=Decimal('100'), color_hex='#000000')
    db_session.add_all([schedule, journal, enrollment])
    await db_session.flush()
    entries: list[JournalEntry] = [JournalEntry(journal_id=journal.id, student_id=test_student.id,
        lesson_date=today - timedelta(days=5-index), attendance=present, is_graded=True)
        for index, present in enumerate([False, False, True, False, False, False])]
    db_session.add_all(entries)
    charges: list[Charge] = [Charge(enrollment_id=enrollment.id, student_id=test_student.id, sequence_no=index + 1,
        amount=Decimal('100'), due_date=today - timedelta(days=days), status=status)
        for index, (days, status) in enumerate([(0, ChargeStatus.OPEN), (7, ChargeStatus.OPEN), (8, ChargeStatus.OPEN), (1, ChargeStatus.OPEN)])]
    db_session.add_all(charges)
    payment: LedgerEntry = LedgerEntry(student_id=test_student.id, type=LedgerEntryType.PAYMENT, amount=Decimal('125'),
        method=PaymentMethod.CASH, occurred_at=datetime.now(timezone.utc), recorded_by_id=test_mentor.id)
    db_session.add(payment)
    await db_session.flush()
    db_session.add_all([Allocation(ledger_entry_id=payment.id, charge_id=charges[3].id, amount=Decimal('100')),
        Allocation(ledger_entry_id=payment.id, charge_id=charges[1].id, amount=Decimal('25'))])
    await db_session.flush()
    service: DashboardAttentionService = DashboardAttentionService(DashboardAttentionRepository(db_session), FixedClock())
    entries[-1].is_graded = False
    await db_session.flush()
    result: DashboardAttentionResponse = await service.get_attention()
    assert not result.attendance_not_marked
    entries[-1].is_graded = True
    await db_session.flush()
    result = await service.get_attention()
    assert len(result.lessons_in_progress) == 1
    assert not result.attendance_not_marked
    assert result.absent_students[0].students[0].consecutive_absences == 3
    assert [item.due_date for item in result.payments] == [today, today - timedelta(days=7)]
    assert [item.remaining_amount for item in result.payments] == [Decimal('100'), Decimal('75')]
    entries[-1].is_graded = False
    schedule.time_start = time(10, 0)
    await db_session.flush()
    result = await service.get_attention()
    assert len(result.attendance_not_marked) == 1
    assert not result.absent_students
    entries[-1].is_graded = True
    await db_session.flush()
    assert not (await service.get_attention()).attendance_not_marked
    enrollment.status = EnrollmentStatus.WITHDRAWN
    await db_session.flush()
    result = await service.get_attention()
    assert not result.absent_students and not result.payments
    enrollment.status = EnrollmentStatus.ACTIVE
    student: User | None = await db_session.get(User, test_student.id)
    assert student is not None
    student.is_deleted = True
    await db_session.flush()
    result = await service.get_attention()
    assert not result.absent_students and not result.payments


@pytest.mark.asyncio
async def test_dashboard_attention_forbids_mentor_and_student(client: AsyncClient, test_mentor: User, test_student: User) -> None:
    for user in (test_mentor, test_student):
        token: str = create_access_token(user.id, user.role)
        response: Response = await client.get('/api/v1/dashboard/attention', headers={'Authorization': f'Bearer {token}'})
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_dashboard_attention_query_count(db_session: AsyncSession, test_mentor: User) -> None:
    count: list[int] = [0]
    def record_query(*args: object, **kwargs: object) -> None:
        count[0] += 1
    event.listen(db_session.bind.sync_engine, 'before_cursor_execute', record_query)
    try:
        service: DashboardAttentionService = DashboardAttentionService(DashboardAttentionRepository(db_session), FixedClock())
        await service.get_attention()
        baseline: int = count[0]
        for index in range(5):
            course: Course = Course(title=f'Course {index}', description='Course', mentor_id=test_mentor.id,
                price=Decimal('100'), start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), exam_type=CourseExamType.MONTHLY)
            db_session.add(course)
            await db_session.flush()
            db_session.add(CourseSchedule(course_id=course.id, day_of_week=1, time_start=time(9), time_end=time(11)))
        await db_session.flush()
        count[0] = 0
        await service.get_attention()
        assert count[0] == baseline == 3
    finally:
        event.remove(db_session.bind.sync_engine, 'before_cursor_execute', record_query)
