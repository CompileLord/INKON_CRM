from dataclasses import dataclass
from datetime import date, datetime, timezone, tzinfo
from decimal import Decimal
from unittest.mock import AsyncMock
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.allocation import Allocation
from app.models.charge import Charge, ChargeStatus
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.ledger import LedgerEntry, LedgerEntryType
from app.models.user import User, UserRole
from app.workers import tasks


@dataclass(frozen=True)
class ReminderScenario:
    student: User
    course: Course
    enrollment: Enrollment
    charge: Charge


class ReminderFixture:
    today: date = date(2026, 10, 20)

    @classmethod
    async def prepare(cls, session: AsyncSession, mentor: User, index: int = 1, days: int = 2) -> ReminderScenario:
        student: User = User(
            email=f"ledger-reminder-{index}@example.test",
            first_name="Ledger",
            last_name=f"Student {index}",
            role=UserRole.STUDENT,
            must_set_password=False,
            parent_telegram_chat_id=900000 + index,
            payment_day_of_month=22,
        )
        session.add(student)
        await session.flush()
        course: Course = Course(
            title=f"Ledger course {index}",
            description="Synthetic",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 12, 1),
            price=Decimal("100.00"),
            exam_type=CourseExamType.WEEKLY,
            mentor_id=mentor.id,
            status=CourseStatus.ACTIVE,
        )
        session.add(course)
        await session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=student.id,
            course_id=course.id,
            price_at_enrollment=Decimal("100.00"),
            color_hex="#0000FF",
            status=EnrollmentStatus.ACTIVE,
        )
        session.add(enrollment)
        await session.flush()
        charge: Charge = Charge(
            student_id=student.id,
            enrollment_id=enrollment.id,
            sequence_no=1,
            amount=Decimal("100.00"),
            due_date=date(2026, 10, 20 + days),
            status=ChargeStatus.OPEN,
        )
        session.add(charge)
        await session.commit()
        return ReminderScenario(student, course, enrollment, charge)

    @classmethod
    async def allocate(
        cls,
        session: AsyncSession,
        scenario: ReminderScenario,
        mentor: User,
        amount: str,
        kind: LedgerEntryType = LedgerEntryType.PAYMENT,
        reversed_allocation: bool = False,
    ) -> Allocation:
        entry: LedgerEntry = LedgerEntry(
            student_id=scenario.student.id,
            recorded_by_id=mentor.id,
            type=kind,
            amount=Decimal(amount),
            occurred_at=datetime(2026, 10, 19, tzinfo=timezone.utc),
        )
        session.add(entry)
        await session.flush()
        reversal: LedgerEntry | None = None
        if reversed_allocation:
            reversal = LedgerEntry(
                student_id=scenario.student.id,
                recorded_by_id=mentor.id,
                type=LedgerEntryType.REFUND,
                amount=Decimal(amount),
                occurred_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
                reverses_entry_id=entry.id,
                is_cash_out=True,
            )
            session.add(reversal)
            await session.flush()
        allocation: Allocation = Allocation(
            ledger_entry_id=entry.id,
            charge_id=scenario.charge.id,
            amount=Decimal(amount),
            reversed_by_entry_id=reversal.id if reversal is not None else None,
        )
        session.add(allocation)
        await session.commit()
        return allocation

    @classmethod
    def clock(cls, monkeypatch: pytest.MonkeyPatch) -> None:
        class ReminderClock(datetime):
            @classmethod
            def now(cls, tz: tzinfo | None = None) -> datetime:
                return datetime(2026, 10, 20, 12, tzinfo=tz)

        monkeypatch.setattr(tasks, "datetime", ReminderClock)

    @classmethod
    async def run(cls, monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
        cls.clock(monkeypatch)
        enqueue: AsyncMock = AsyncMock()
        monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
        await tasks.check_payment_reminders({})
        return enqueue
