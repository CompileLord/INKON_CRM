import pytest
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus, CourseExamType
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.payment import Payment, PaymentMethod
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from app.services.notification_service import NotificationService
from app.workers.tasks import archive_expired_courses, check_payment_reminders
from app.telegram_bot.bot import bot


@pytest.mark.asyncio
async def test_security_headers_and_cors(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"


@pytest.mark.asyncio
async def test_html_input_sanitization(db_session: AsyncSession, test_mentor: User) -> None:
    course = Course(
        title="Test <b>Course</b>",
        description="<p>This is a <i>test</i> course.</p>",
        start_date=date(2026, 7, 12),
        end_date=date(2026, 8, 12),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()
    await db_session.refresh(course)
    assert course.title == "Test Course"
    assert course.description == "This is a test course."


@pytest.mark.asyncio
async def test_progress_chart_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    course = Course(
        title="Physics 101",
        description="Intro physics",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("150.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("150.0"),
        color_hex="#FF0000",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)

    journal = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 7),
        period_type=JournalPeriodType.WEEK
    )
    db_session.add(journal)
    await db_session.commit()

    summary = JournalStudentSummary(
        journal_id=journal.id,
        student_id=test_student.id,
        exam_score=80,
        bonus_score=5,
        sum_score=85,
        attendance_count=3,
        total_lessons=3
    )
    db_session.add(summary)
    await db_session.commit()

    response = await client.get(f"/api/v1/courses/{course.id}/progress-chart", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "labels" in data
    assert "datasets" in data
    assert data["labels"] == ["Week 1", "Average"]
    assert len(data["datasets"]) == 1
    assert data["datasets"][0]["student_id"] == test_student.id
    assert data["datasets"][0]["color_hex"] == "#FF0000"
    assert data["datasets"][0]["scores"] == [85, 85.0]


@pytest.mark.asyncio
async def test_mentor_analytics_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_mentor: User,
    test_student: User
) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {admin_token}"}

    course = Course(
        title="Math",
        description="Intro math",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("120.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("120.0"),
        color_hex="#00FF00",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)

    journal = Journal(
        course_id=course.id,
        period_label="Week 1",
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 7),
        period_type=JournalPeriodType.WEEK
    )
    db_session.add(journal)
    await db_session.commit()

    summary = JournalStudentSummary(
        journal_id=journal.id,
        student_id=test_student.id,
        exam_score=90,
        bonus_score=2,
        sum_score=92,
        attendance_count=3,
        total_lessons=3
    )
    db_session.add(summary)
    await db_session.commit()

    response = await client.get(f"/api/v1/mentors/{test_mentor.id}/analytics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["active_courses_count"] == 1
    assert data["total_students_count"] == 1
    assert data["average_student_score"] == 92.0


@pytest.mark.asyncio
async def test_telegram_webhook_and_parent_binding(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
    monkeypatch
) -> None:
    from aiogram import Bot
    from app.core.config import settings
    mock_call = AsyncMock(return_value=None)
    monkeypatch.setattr(Bot, "__call__", mock_call)

    test_student.phone = "+992900000000"
    db_session.add(test_student)
    await db_session.commit()

    payload = {
        "update_id": 12345,
        "message": {
            "message_id": 54321,
            "date": 1441645532,
            "chat": {
                "id": 998877,
                "type": "private",
                "first_name": "Parent"
            },
            "from": {
                "id": 998877,
                "is_bot": False,
                "first_name": "Parent"
            },
            "contact": {
                "phone_number": "992900000000",
                "first_name": "Parent",
                "user_id": 998877
            }
        }
    }

    headers = {"X-Telegram-Bot-Api-Secret-Token": settings.TELEGRAM_BOT_SECRET_TOKEN}
    response = await client.post("/api/v1/telegram/webhook", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id == 998877


@pytest.mark.asyncio
async def test_archive_expired_courses(db_session: AsyncSession, test_mentor: User) -> None:
    course = Course(
        title="Expired Physics",
        description="Intro physics",
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 30),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("150.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    await archive_expired_courses(None)

    await db_session.refresh(course)
    assert course.status == CourseStatus.ARCHIVED


@pytest.mark.asyncio
async def test_check_payment_reminders(db_session: AsyncSession, test_student: User, test_mentor: User, monkeypatch) -> None:
    test_student.payment_day_of_month = 14
    test_student.parent_telegram_chat_id = 998877
    test_student.phone = "+992900000000"
    db_session.add(test_student)

    course = Course(
        title="Geometry",
        description="Intro geometry",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 31),
        exam_type=CourseExamType.WEEKLY,
        price=Decimal("100.0"),
        mentor_id=test_mentor.id,
        status=CourseStatus.ACTIVE
    )
    db_session.add(course)
    await db_session.commit()

    enrollment = Enrollment(
        student_id=test_student.id,
        course_id=course.id,
        price_at_enrollment=Decimal("100.0"),
        color_hex="#0000FF",
        status=EnrollmentStatus.ACTIVE
    )
    db_session.add(enrollment)
    await db_session.commit()

    mock_enqueue = AsyncMock()
    monkeypatch.setattr("app.core.redis.enqueue_job", mock_enqueue)

    from datetime import datetime
    class MockDate:
        @classmethod
        def today(cls):
            return date(2026, 7, 12)
        def __new__(cls, *args, **kwargs):
            return date(*args, **kwargs)

    class MockDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            dt = datetime(2026, 7, 12, 12, 0, 0)
            if tz:
                return dt.replace(tzinfo=tz)
            return dt

    monkeypatch.setattr("app.workers.tasks.date", MockDate)
    monkeypatch.setattr("app.workers.tasks.datetime", MockDatetime)

    await check_payment_reminders(None)

    assert mock_enqueue.call_count == 1
    call_args = mock_enqueue.call_args[1]
    assert call_args.get("chat_id") == 998877
    assert "Напоминание: оплата за курс Geometry" in call_args.get("text")


@pytest.mark.asyncio
async def test_notification_service_idempotency(db_session: AsyncSession) -> None:
    notification_service = NotificationService(db_session)
    recipient = "998877"
    notification_type = NotificationType.PAYMENT_REMINDER_2D
    related_entity_id = 1
    notification_date = date(2026, 7, 12)

    send_count = 0

    async def mock_send_func(is_update: bool) -> None:
        nonlocal send_count
        send_count += 1

    success1 = await notification_service.send_notification_with_idempotency(
        recipient=recipient,
        notification_type=notification_type,
        related_entity_id=related_entity_id,
        notification_date=notification_date,
        send_func=mock_send_func
    )
    assert success1 is True
    assert send_count == 1

    success2 = await notification_service.send_notification_with_idempotency(
        recipient=recipient,
        notification_type=notification_type,
        related_entity_id=related_entity_id,
        notification_date=notification_date,
        send_func=mock_send_func
    )
    assert success2 is False
    assert send_count == 1
