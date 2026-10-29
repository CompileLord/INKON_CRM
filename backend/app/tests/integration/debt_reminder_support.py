from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from sqlalchemy import select
from app.core.security import hash_password
from app.models.charge import Charge
from app.models.course import Course
from app.models.debt_reminder_notification import DebtReminderNotification
from app.models.enrollment import Enrollment
from app.models.telegram_link import TelegramChatPreference
from app.models.user import User, UserRole
from conftest import TestingSessionLocal
from app.tests.factories import auth_headers as bearer


@dataclass
class RecordingSender:
    messages: list[tuple[int, str]] = field(default_factory=list)
    failures: list[Exception] = field(default_factory=list)

    async def send_text(self, chat_id: int, text: str) -> None:
        if self.failures:
            raise self.failures.pop(0)
        self.messages.append((chat_id, text))


class MutableClock:
    def __init__(self, moment: datetime) -> None:
        self.moment: datetime = moment

    def __call__(self) -> datetime:
        return self.moment


async def create_student(
    email: str, chat_id: int | None = None, language: str | None = None, first_name: str = "Ali"
) -> int:
    session: Any
    async with TestingSessionLocal() as session:
        student: User = User(
            email=email, password_hash=hash_password("student_pass123"), first_name=first_name, last_name="Valiev",
            role=UserRole.STUDENT, must_set_password=False, parent_telegram_chat_id=chat_id,
        )
        session.add(student)
        if language is not None and chat_id is not None:
            existing: TelegramChatPreference | None = await session.scalar(
                select(TelegramChatPreference).where(TelegramChatPreference.chat_id == chat_id)
            )
            if existing is None:
                session.add(TelegramChatPreference(chat_id=chat_id, language=language))
        await session.commit()
        return student.id


async def add_debt(
    student_id: int, mentor_id: int, title: str, amount: str, due_date: date, sequence_no: int = 1
) -> int:
    session: Any
    async with TestingSessionLocal() as session:
        course: Course = Course(
            title=title, description="d", start_date=date(2026, 1, 1), end_date=date(2026, 12, 1),
            exam_type="monthly", price=Decimal(amount), mentor_id=mentor_id,
        )
        session.add(course)
        await session.flush()
        enrollment: Enrollment = Enrollment(
            student_id=student_id, course_id=course.id, price_at_enrollment=Decimal(amount), color_hex="#112233"
        )
        session.add(enrollment)
        await session.flush()
        session.add(Charge(
            enrollment_id=enrollment.id, student_id=student_id, sequence_no=sequence_no,
            amount=Decimal(amount), due_date=due_date,
        ))
        await session.commit()
        return enrollment.id


async def add_charge(enrollment_id: int, student_id: int, amount: str, due_date: date, sequence_no: int) -> None:
    session: Any
    async with TestingSessionLocal() as session:
        session.add(Charge(
            enrollment_id=enrollment_id, student_id=student_id, sequence_no=sequence_no,
            amount=Decimal(amount), due_date=due_date,
        ))
        await session.commit()


async def all_reminders() -> list[DebtReminderNotification]:
    session: Any
    async with TestingSessionLocal() as session:
        result: Any = await session.execute(select(DebtReminderNotification).order_by(DebtReminderNotification.id))
        return list(result.scalars().all())


def days_ago(days: int) -> date:
    return date.today() - timedelta(days=days)
