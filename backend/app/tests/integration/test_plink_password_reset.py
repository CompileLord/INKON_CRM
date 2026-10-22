from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User
from app.services.sms.messages import PasswordSmsMessageFactory, PasswordSmsReason, SmsLanguage
from app.tests.integration.plink_support import PlinkApi, PlinkOutbox, PlinkUsers
from app.tests.sms_fakes import FakeSmsSender
from app.tests.sms_test_support import SmsPasswordTestSupport


async def sms_recipients(db_session: AsyncSession) -> list[str | None]:
    return [event.recipient_phone for event in await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS)]


@pytest.mark.asyncio
async def test_default_reset_sends_email_code_to_accounts_with_email(
    client: AsyncClient, test_mentor: User, db_session: AsyncSession
) -> None:
    student_email: str = "reset.mail@example.com"
    mentor_email: str = test_mentor.email
    await PlinkUsers.create(db_session, student_email, "+992900000601")
    by_phone: Response = await PlinkApi.reset(client, {"login": "+992900000601"})
    by_email: Response = await PlinkApi.reset(client, {"login": mentor_email})
    legacy: Response = await PlinkApi.reset(client, {"email": student_email})
    assert by_phone.status_code == by_email.status_code == legacy.status_code == 200
    recipients: list[str | None] = [e.recipient_email for e in await PlinkOutbox.events(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL)]
    assert sorted(recipients) == sorted([student_email, mentor_email, student_email])
    assert await sms_recipients(db_session) == []


@pytest.mark.asyncio
async def test_default_reset_for_email_less_student_sends_sms_to_own_phone_then_parent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    own: User = await PlinkUsers.create(db_session, None, "+992900000611", "+992900000612")
    parent_only: User = await PlinkUsers.create(db_session, None, "+99213", "+992900000613")
    await PlinkApi.reset(client, {"login": own.phone})
    await PlinkApi.reset(client, {"login": parent_only.phone})
    assert await sms_recipients(db_session) == ["+992900000611", "+992900000613"]
    assert await PlinkOutbox.events(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL) == []


@pytest.mark.asyncio
async def test_fallback_channel_targets_own_or_parent_phone_even_when_email_exists(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    student: User = await PlinkUsers.create(db_session, "fb@example.com", "+992900000621", "+992900000622")
    student_id: int = student.id
    await PlinkApi.reset(client, {"login": "fb@example.com", "channel": "student_phone"})
    await redis_client.delete(f"sms:cooldown:password:{student_id}")
    await PlinkApi.reset(client, {"login": "fb@example.com", "channel": "parent_phone"})
    assert await sms_recipients(db_session) == ["+992900000621", "+992900000622"]
    assert await PlinkOutbox.events(db_session, OutboxEventKind.PASSWORD_RESET_EMAIL) == []


@pytest.mark.asyncio
async def test_fallback_for_staff_uses_own_phone_only_and_ignores_parent_phone(
    client: AsyncClient, test_mentor: User, db_session: AsyncSession
) -> None:
    test_mentor.phone = "+992900000631"
    test_mentor.parent_phone = "+992900000632"
    db_session.add(test_mentor)
    await db_session.commit()
    mentor_id: int = test_mentor.id
    own: Response = await PlinkApi.reset(client, {"login": test_mentor.email, "channel": "student_phone"})
    await redis_client.delete(f"sms:cooldown:password:{mentor_id}")
    parent: Response = await PlinkApi.reset(client, {"login": test_mentor.email, "channel": "parent_phone"})
    assert own.status_code == parent.status_code == 200
    assert await sms_recipients(db_session) == ["+992900000631"]


@pytest.mark.asyncio
async def test_reset_responses_are_identical_for_existing_missing_channelless_and_capped_accounts(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_ACCOUNT_LIMIT", 1)
    full: User = await PlinkUsers.create(db_session, None, "+992900000641", "+992900000642")
    no_parent: User = await PlinkUsers.create(db_session, "np@example.com", "+992900000643")
    bodies: list[dict[str, Any]] = [
        {"login": full.phone, "channel": "student_phone"},
        {"login": full.phone, "channel": "student_phone"},
        {"login": full.phone, "channel": "parent_phone"},
        {"login": no_parent.email, "channel": "parent_phone"},
        {"login": "+992900000699", "channel": "parent_phone"},
        {"login": "ghost.plink@example.com"},
        {"email": "ghost.plink@example.com", "channel": "student_phone"},
    ]
    responses: list[Response] = [await PlinkApi.reset(client, body) for body in bodies]
    assert {(r.status_code, r.text) for r in responses} == {(200, responses[0].text)}
    assert await sms_recipients(db_session) == ["+992900000641"]


@pytest.mark.asyncio
async def test_fallback_path_is_capped_per_phone_daily_with_uniform_response(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_PHONE_DAILY_LIMIT", 1)
    await PlinkUsers.create(db_session, None, "+99221", "+992900000651")
    await PlinkUsers.create(db_session, None, "+99222", "+992900000651")
    one: Response = await PlinkApi.reset(client, {"login": "+99221", "channel": "parent_phone"})
    two: Response = await PlinkApi.reset(client, {"login": "+99222", "channel": "parent_phone"})
    assert one.text == two.text and one.status_code == two.status_code == 200
    assert await sms_recipients(db_session) == ["+992900000651"]


@pytest.mark.asyncio
async def test_fallback_path_is_capped_by_ip_budget_with_uniform_response(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "SMS_PASSWORD_IP_LIMIT", 1)
    await PlinkUsers.create(db_session, None, "+992900000661")
    await PlinkUsers.create(db_session, None, "+992900000662")
    first: Response = await PlinkApi.reset(client, {"login": "+992900000661", "channel": "student_phone"})
    capped: Response = await PlinkApi.reset(client, {"login": "+992900000662", "channel": "student_phone"})
    assert first.status_code == capped.status_code == 200 and first.text == capped.text
    assert await sms_recipients(db_session) == ["+992900000661"]


@pytest.mark.asyncio
async def test_sms_reset_keeps_current_password_valid_until_the_sms_password_is_used(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await PlinkUsers.create(db_session, "keep@example.com", "+992900000671")
    await PlinkApi.reset(client, {"login": "keep@example.com", "channel": "student_phone"})
    code: str = SmsPasswordTestSupport.read_code((await PlinkOutbox.events(db_session, OutboxEventKind.STUDENT_PASSWORD_SMS))[0])
    assert (await SmsPasswordTestSupport.login(client, "keep@example.com", "plink_pass123")).status_code == 200
    assert (await SmsPasswordTestSupport.login(client, "+992900000671", code)).status_code == 200
    assert (await SmsPasswordTestSupport.login(client, "keep@example.com", "plink_pass123")).status_code == 401


@pytest.mark.parametrize("language", [SmsLanguage.RU, SmsLanguage.TG, SmsLanguage.EN])
@pytest.mark.parametrize("reason", [PasswordSmsReason.INITIAL, PasswordSmsReason.RESET])
def test_parent_sms_names_the_child_and_stays_within_seventy_characters(language: SmsLanguage, reason: PasswordSmsReason) -> None:
    factory: PasswordSmsMessageFactory = PasswordSmsMessageFactory()
    short: str = factory.build(language.value, reason, "12345Z", "Амина")
    long_named: str = factory.build(language.value, reason, "12345Z", "Муҳаммадризо" * 8)
    assert "Амина" in short and short.endswith("12345Z")
    assert len(long_named) <= PasswordSmsMessageFactory.MAXIMUM_LENGTH and long_named.endswith("12345Z")
    assert "Муҳаммадризо" in long_named
    assert "Амина" not in factory.build(language.value, reason, "12345Z", None)


@pytest.mark.asyncio
async def test_worker_message_to_parent_includes_first_name_and_own_phone_message_does_not(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await PlinkUsers.create(db_session, "msg1@example.com", "+992900000681", "+992900000682", first_name="Kamila")
    await PlinkUsers.create(db_session, "msg2@example.com", "+992900000683", "+992900000684", first_name="Aziz")
    await PlinkApi.reset(client, {"login": "msg1@example.com", "channel": "parent_phone"})
    await PlinkApi.reset(client, {"login": "msg2@example.com", "channel": "student_phone"})
    sender: FakeSmsSender = FakeSmsSender()
    await SmsPasswordTestSupport.build_worker(sender).run_once(SmsPasswordTestSupport.build_session_factory())
    messages: dict[str, str] = {send.phone_e164: send.message for send in sender.sends}
    assert set(messages) == {"+992900000682", "+992900000683"}
    assert "Kamila" in messages["+992900000682"]
    assert "Aziz" not in messages["+992900000683"]
