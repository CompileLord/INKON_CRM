import json
from datetime import date, datetime, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.email_templates import OutboxEmailTemplateFactory, RenderedEmail
from app.services.outbox_service import OutboxService
from app.services.sms.messages import PasswordSmsMessageFactory, PasswordSmsReason


class U12Assertions:
    footer: dict[str, str] = {"en": "KITOB — Educational Center", "ru": "KITOB — Учебный центр", "tg": "KITOB — Маркази таълимӣ"}
    reset_subject: dict[str, str] = {"en": "password reset code", "ru": "код для сброса пароля", "tg": "рамзи барқарорсозии гузарвожа"}
    credentials_subject: dict[str, str] = {"en": "Your KITOB sign-in details", "ru": "Ваши данные для входа в KITOB", "tg": "Маълумоти воридшавии шумо ба KITOB"}

    @classmethod
    def headers(cls, user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role, auth_version=user.auth_version)}"}

    @classmethod
    async def event(cls, session: AsyncSession, kind: OutboxEventKind) -> tuple[OutboxEvent, str]:
        event: OutboxEvent = (await session.execute(select(OutboxEvent).where(OutboxEvent.kind == kind).order_by(OutboxEvent.id.desc()))).scalars().first()
        assert event is not None
        outbox: OutboxService = OutboxService(SQLAlchemyOutboxRepository(session), settings.JWT_SECRET_KEY)
        return event, outbox.decrypt_payload(event)


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ru", "tg"])
async def test_reset_email_language(client: AsyncClient, db_session: AsyncSession, test_student: User, language: str) -> None:
    response: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "language": language})
    assert response.status_code == 200
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL)
    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(event.kind, event.recipient_email, payload).render()
    assert U12Assertions.reset_subject[language] in rendered.subject
    assert U12Assertions.footer[language] in rendered.plain_text
    assert U12Assertions.footer[language] in rendered.html_body
    assert f'<html lang="{language}">' in rendered.html_body


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ru", "tg"])
async def test_credentials_email_language(client: AsyncClient, db_session: AsyncSession, test_admin: User, language: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://school.example/crm/")
    response: Response = await client.post("/api/v1/users/", headers=U12Assertions.headers(test_admin), json={"email": "u12@example.com", "first_name": "Ali", "last_name": "Test", "role": "mentor", "preferred_language": language})
    assert response.status_code == 201, response.text
    assert response.json()["preferred_language"] == language
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.CREDENTIALS_EMAIL)
    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(event.kind, event.recipient_email, payload).render()
    assert rendered.subject == U12Assertions.credentials_subject[language]
    assert event.subject == rendered.subject
    assert U12Assertions.footer[language] in rendered.plain_text
    assert U12Assertions.footer[language] in rendered.html_body
    assert 'href="https://school.example/crm/login"' in rendered.html_body
    assert "https://school.example/crm/login" in rendered.plain_text


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ru", "tg"])
@pytest.mark.parametrize("reason", [PasswordSmsReason.INITIAL, PasswordSmsReason.RESET])
async def test_credentials_sms_language(client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, language: str, reason: PasswordSmsReason) -> None:
    response: Response = await client.patch("/api/v1/users/me", headers=U12Assertions.headers(test_student), json={"preferred_language": language})
    assert response.status_code == 200, response.text
    persisted_student: User | None = await db_session.get(User, test_student.id)
    assert persisted_student is not None
    from app.services.student_password_sms_factory import StudentPasswordSmsServiceFactory
    await StudentPasswordSmsServiceFactory.create(db_session).issue_password(persisted_student, reason, test_admin.id, False)
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS)
    details: dict[str, Any] = json.loads(payload)
    assert details["language"] == language
    rendered: str = PasswordSmsMessageFactory().build(details["language"], reason, details["code"])
    expected: dict[str, str] = {"en": "password", "ru": "пароль", "tg": "рамзи"}
    assert expected[language] in rendered


@pytest.mark.asyncio
@pytest.mark.parametrize(("preferred", "body_language", "header", "expected"), [("tg", "en", "ru", "tg"), (None, "en", "tg", "en"), (None, None, "fr;q=1, tg-TJ;q=0.9, en;q=0.5", "tg"), (None, None, "de", "ru"), (None, None, "en;q=0, ru;q=0.5", "ru")])
async def test_language_resolution(client: AsyncClient, db_session: AsyncSession, test_student: User, preferred: str | None, body_language: str | None, header: str, expected: str) -> None:
    response: Response = await client.patch("/api/v1/users/me", headers=U12Assertions.headers(test_student), json={"preferred_language": preferred})
    assert response.status_code == 200
    body: dict[str, Any] = {"email": test_student.email}
    if body_language is not None:
        body["language"] = body_language
    response = await client.post("/api/v1/auth/password-reset/request", json=body, headers={"Accept-Language": header})
    assert response.status_code == 200
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL)
    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(event.kind, event.recipient_email, payload).render()
    assert U12Assertions.reset_subject[expected] in rendered.subject


@pytest.mark.asyncio
async def test_inbox_excludes_unsent(client: AsyncClient, db_session: AsyncSession, test_student: User) -> None:
    state: NotificationStatus
    for state in NotificationStatus:
        log: NotificationLog = NotificationLog(user_id=test_student.id, recipient=state.value, type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2026, 10, 23), status=NotificationStatus.FAILED, delivery_state=state, sent_at=datetime.now(timezone.utc) if state == NotificationStatus.SENT else None)
        db_session.add(log)
    await db_session.commit()
    headers: dict[str, str] = U12Assertions.headers(test_student)
    response: Response = await client.get("/api/v1/notifications/", headers=headers)
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["status"] == "sent"
    assert response.json()["items"][0]["sent_at"] is not None
    response = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert response.json() == {"unread_count": 1}
    response = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert response.json() == {"updated_count": 1}


@pytest.mark.asyncio
async def test_language_validation(client: AsyncClient, test_student: User) -> None:
    response: Response = await client.patch("/api/v1/users/me", headers=U12Assertions.headers(test_student), json={"preferred_language": "de"})
    assert response.status_code == 422
    response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "language": "de"})
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(("preferred", "requested", "expected"), [("tg", "en", "tg"), (None, "en", "en"), (None, None, "ru")])
async def test_forgot_sms_language_resolution(client: AsyncClient, db_session: AsyncSession, test_student: User, preferred: str | None, requested: str | None, expected: str) -> None:
    response: Response = await client.patch("/api/v1/users/me", headers=U12Assertions.headers(test_student), json={"preferred_language": preferred})
    assert response.status_code == 200
    body: dict[str, Any] = {"email": test_student.email, "channel": "student_phone"}
    if requested is not None:
        body["language"] = requested
    response = await client.post("/api/v1/auth/password-reset/request", json=body)
    assert response.status_code == 200
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS)
    assert json.loads(payload)["language"] == expected


@pytest.mark.asyncio
async def test_admin_language_update_and_clear(client: AsyncClient, test_admin: User, test_student: User) -> None:
    headers: dict[str, str] = U12Assertions.headers(test_admin)
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=headers, json={"preferred_language": "en"})
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "en"
    response = await client.patch(f"/api/v1/users/{test_student.id}", headers=headers, json={"preferred_language": None})
    assert response.status_code == 200
    assert response.json()["preferred_language"] is None


@pytest.mark.asyncio
async def test_reset_worker_accepts_localized_payload(client: AsyncClient, db_session: AsyncSession, test_student: User) -> None:
    from app.workers.outbox import OutboxWorkerManager
    response: Response = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email, "language": "tg"})
    assert response.status_code == 200
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL)
    worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
    try:
        assert await worker.check_verification_state(event, payload, db_session) == (True, "")
        details: dict[str, str] = json.loads(payload)
        assert await worker.check_verification_state(event, details["code"], db_session) == (True, "")
        details["code"] = "invalid"
        assert await worker.check_verification_state(event, json.dumps(details), db_session) == (False, "reset_code_superseded")
    finally:
        await worker.stop()


@pytest.mark.parametrize("kind", [OutboxEventKind.VERIFICATION_EMAIL, OutboxEventKind.PASSWORD_RESET_EMAIL])
def test_legacy_code_payloads(kind: OutboxEventKind) -> None:
    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(kind, "u12@example.com", "123456").render()
    assert "123456" in rendered.plain_text
    assert U12Assertions.footer["ru"] in rendered.plain_text


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ru", "tg"])
async def test_reminder_and_exam_preferred_language(db_session: AsyncSession, test_student: User, test_mentor: User, language: str) -> None:
    from decimal import Decimal
    from app.models.course import Course
    from app.models.journal import Journal
    from app.models.journal_student_summary import JournalStudentSummary
    from app.models.telegram_link import TelegramChatPreference
    from app.repositories.interfaces.exam_result_notification_repository import ExamResultSource
    from app.repositories.interfaces.debt_reminder_repository import DebtReminderSource
    from app.repositories.interfaces.payment_reminder_repository import PaymentReminderSource
    from app.repositories.sqlalchemy.exam_result_source_repository import SQLAlchemyExamResultSourceRepository
    from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
    from app.repositories.sqlalchemy.charge_balance_query import ChargeBalanceQuery
    from app.services.payment_reminder_messages import PaymentReminderMessages
    from app.services.exam_result_image import ExamResultCardData, ExamResultSvgRenderer
    from app.tests.integration.debt_reminder_support import add_debt
    persisted_student: User | None = await db_session.get(User, test_student.id)
    assert persisted_student is not None
    persisted_student.preferred_language = language
    persisted_student.parent_telegram_chat_id = 121212
    db_session.add(TelegramChatPreference(chat_id=121212, language="ru"))
    await db_session.commit()
    await add_debt(test_student.id, test_mentor.id, "U12 Course", "125.50", date(2026, 10, 24))
    course: Course = (await db_session.execute(select(Course))).scalars().one()
    journal: Journal = Journal(course_id=course.id, period_label="Week 1", period_start=date(2026, 10, 19), period_end=date(2026, 10, 25), period_type="week")
    db_session.add(journal)
    await db_session.flush()
    db_session.add(JournalStudentSummary(journal_id=journal.id, student_id=test_student.id, exam_score=55, sum_score=55, is_graded=True))
    await db_session.commit()
    exam_source: ExamResultSource | None = await SQLAlchemyExamResultSourceRepository(db_session).load_source(test_student.id, journal.id)
    assert exam_source is not None and exam_source.parent_language == language
    debt_source: DebtReminderSource | None = await SQLAlchemyDebtReminderRepository(db_session).load_source(test_student.id, date(2026, 10, 25))
    assert debt_source is not None and debt_source.parent_language == language
    balance: Any = (await db_session.execute(ChargeBalanceQuery().balances())).one()
    assert balance.language == language
    reminder: PaymentReminderSource = PaymentReminderSource(balance.enrollment_id, test_student.id, 121212, "Ali", "U12 Course", date(2026, 10, 24), Decimal("125.50"), balance.language)
    reminder_text: str = PaymentReminderMessages().render(reminder, date(2026, 10, 23))
    expected: dict[str, str] = {"en": "Reminder:", "ru": "Напоминание:", "tg": "Ёдрасӣ:"}
    assert expected[language] in reminder_text
    assert "125.50" in reminder_text
    card: ExamResultCardData = ExamResultCardData(student_name=exam_source.student_name, course_title=exam_source.course_title, period_label=exam_source.period_label, exam_score=exam_source.exam_score, exam_max_score=exam_source.exam_max_score, total_score=exam_source.sum_score, max_period_score=exam_source.max_period_score, attendance_count=exam_source.attendance_count, total_lessons=exam_source.total_lessons, rendered_at=datetime.now(timezone.utc))
    caption: str = ExamResultSvgRenderer().build_caption(card, language)
    assert "U12 Course" in caption


@pytest.mark.asyncio
async def test_inbox_excludes_missing_timestamp_and_read_unsent(client: AsyncClient, db_session: AsyncSession, test_student: User) -> None:
    missing_time: NotificationLog = NotificationLog(user_id=test_student.id, recipient="missing", type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2026, 10, 23), status=NotificationStatus.SENT)
    unsent: NotificationLog = NotificationLog(user_id=test_student.id, recipient="queued", type=NotificationType.EXAM_RESULT, related_entity_id=2, notification_date=date(2026, 10, 23), status=NotificationStatus.FAILED, delivery_state=NotificationStatus.QUEUED)
    db_session.add_all([missing_time, unsent])
    await db_session.commit()
    headers: dict[str, str] = U12Assertions.headers(test_student)
    response: Response = await client.get("/api/v1/notifications/", headers=headers)
    assert response.json()["items"] == []
    response = await client.patch(f"/api/v1/notifications/{unsent.id}/read", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ru", "tg"])
async def test_verification_email_language(db_session: AsyncSession, test_student: User, language: str) -> None:
    from app.services.auth_composition import AuthServiceComposition
    persisted_student: User | None = await db_session.get(User, test_student.id)
    assert persisted_student is not None
    persisted_student.preferred_language = language
    await db_session.commit()
    await AuthServiceComposition.create(db_session).generate_verification_code(test_student.email)
    event: OutboxEvent
    payload: str
    event, payload = await U12Assertions.event(db_session, OutboxEventKind.VERIFICATION_EMAIL)
    rendered: RenderedEmail = OutboxEmailTemplateFactory().create(event.kind, event.recipient_email, payload).render()
    assert U12Assertions.footer[language] in rendered.html_body
    assert U12Assertions.footer[language] in rendered.plain_text
    expected: dict[str, str] = {"en": "verification code", "ru": "код подтверждения", "tg": "рамзи тасдиқ"}
    assert expected[language] in rendered.subject
