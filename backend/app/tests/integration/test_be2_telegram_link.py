import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
import pytest
from aiogram import Bot
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.core.telegram_link_codes import TelegramLinkCodeGenerator, TelegramLinkCodeHasher
from app.models.audit_log import AuditLog
from app.models.telegram_link import TelegramChatPreference, TelegramLinkCode
from app.models.user import User, UserRole
from app.services.telegram_link_service import IssuedLinkCode, LinkOutcome, LinkResult, TelegramLinkService
from app.services.telegram_attempt_limiter import TelegramAttemptLimiter
from app.telegram_bot.bot import dp as application_dispatcher
from app.telegram_bot.messages import TelegramMessageCatalog
from be2_telegram_support import FakeTelegramSession, TelegramConversation
from conftest import TestingSessionLocal
import app.telegram_bot.handlers.start as start_module


@pytest.fixture(autouse=True)
def bind_handler_sessions(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.db.session as session_module
    monkeypatch.setattr(session_module, "AsyncSessionLocal", TestingSessionLocal)


@pytest.fixture
def conversation() -> TelegramConversation:
    session: FakeTelegramSession = FakeTelegramSession()
    bot: Bot = Bot(token="123456:test", session=session)
    return TelegramConversation(application_dispatcher, bot, session)


async def issue_code(student_id: int) -> IssuedLinkCode:
    async with TestingSessionLocal() as db:
        issued: IssuedLinkCode = await TelegramLinkService(db).issue_code_for_student(student_id, None)
        await db.commit()
        return issued


async def reload_student(student_id: int) -> User:
    async with TestingSessionLocal() as db:
        student: User | None = await db.get(User, student_id)
        assert student is not None
        return student


def admin_headers(admin: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(admin.id, UserRole.SUPERADMIN)}"}


class TestCodeGenerator:
    def test_format_is_five_digits_and_one_allowed_letter(self) -> None:
        generator: TelegramLinkCodeGenerator = TelegramLinkCodeGenerator()
        letter_positions: set[int] = set()
        for _ in range(3000):
            code: str = generator.generate()
            assert len(code) == 6
            digits: list[str] = [character for character in code if character.isdigit()]
            letters: list[str] = [character for character in code if not character.isdigit()]
            assert len(digits) == 5
            assert len(letters) == 1
            assert letters[0] in "ABCDEFGHJKLMNPQRSTUVWXYZ"
            assert letters[0] not in "OI"
            letter_positions.add(code.index(letters[0]))
        assert letter_positions == {0, 1, 2, 3, 4, 5}

    def test_normalize_strips_uppercases_and_rejects_bad_shapes(self) -> None:
        generator: TelegramLinkCodeGenerator = TelegramLinkCodeGenerator()
        assert generator.normalize("  12a345 \n") == "12A345"
        assert generator.normalize("123456") is None
        assert generator.normalize("12O345") is None
        assert generator.normalize("12AB45") is None
        assert generator.normalize("1A345") is None
        assert generator.normalize("12A3456") is None

    def test_hash_is_keyed_deterministic_hmac_sha256(self) -> None:
        first: TelegramLinkCodeHasher = TelegramLinkCodeHasher("secret-one")
        second: TelegramLinkCodeHasher = TelegramLinkCodeHasher("secret-two")
        digest: str = first.hash_code("12A345")
        assert digest == first.hash_code("12A345")
        assert len(digest) == 64
        assert "12A345" not in digest
        assert digest != second.hash_code("12A345")
        assert digest != first.hash_code("12A346")


class TestLinkService:
    @pytest.mark.asyncio
    async def test_only_hash_and_seven_day_expiry_are_stored(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            rows: list[TelegramLinkCode] = list((await db.execute(select(TelegramLinkCode))).scalars())
        assert len(rows) == 1
        assert rows[0].code_hash != issued.code
        assert issued.code not in rows[0].code_hash
        assert rows[0].used_at is None
        lifetime: timedelta = rows[0].expires_at - datetime.now(timezone.utc)
        assert timedelta(hours=71, minutes=59) < lifetime <= timedelta(hours=72)
        assert (await reload_student(test_student.id)).parent_link_code_expires_at == rows[0].expires_at

    @pytest.mark.asyncio
    async def test_new_code_invalidates_previous(self, test_student: User) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        second: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            service: TelegramLinkService = TelegramLinkService(db)
            stale: LinkResult = await service.link_parent_chat(1, first.code)
            fresh: LinkResult = await service.link_parent_chat(1, second.code)
        assert stale.outcome is LinkOutcome.INVALID
        assert fresh.outcome is LinkOutcome.LINKED

    @pytest.mark.asyncio
    async def test_code_is_single_use(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            first: LinkResult = await TelegramLinkService(db).link_parent_chat(11, issued.code)
            await db.commit()
        async with TestingSessionLocal() as db:
            second: LinkResult = await TelegramLinkService(db).link_parent_chat(12, issued.code)
        assert first.outcome is LinkOutcome.LINKED
        assert second.outcome is LinkOutcome.INVALID
        student: User = await reload_student(test_student.id)
        assert student.parent_telegram_chat_id == 11
        assert student.parent_link_code_expires_at is None

    @pytest.mark.asyncio
    async def test_expired_code_is_rejected(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            row: TelegramLinkCode = (await db.execute(select(TelegramLinkCode))).scalars().one()
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await db.commit()
        async with TestingSessionLocal() as db:
            result: LinkResult = await TelegramLinkService(db).link_parent_chat(21, issued.code)
        assert result.outcome is LinkOutcome.INVALID
        assert (await reload_student(test_student.id)).parent_telegram_chat_id is None

    @pytest.mark.asyncio
    async def test_concurrent_consume_links_exactly_one_chat(self, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)

        async def attempt(chat_id: int) -> LinkResult:
            async with TestingSessionLocal() as db:
                result: LinkResult = await TelegramLinkService(db).link_parent_chat(chat_id, issued.code)
                await db.commit()
                return result

        results: list[LinkResult] = await asyncio.gather(*(attempt(chat_id) for chat_id in range(100, 108)))
        linked: list[LinkResult] = [result for result in results if result.outcome is LinkOutcome.LINKED]
        assert len(linked) == 1
        student: User = await reload_student(test_student.id)
        assert student.parent_telegram_chat_id in range(100, 108)

    @pytest.mark.asyncio
    async def test_audit_records_regeneration_link_and_relink_without_code(self, test_student: User) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            await TelegramLinkService(db).link_parent_chat(31, first.code)
            await db.commit()
        second: IssuedLinkCode = await issue_code(test_student.id)
        async with TestingSessionLocal() as db:
            await TelegramLinkService(db).link_parent_chat(32, second.code)
            await db.commit()
            logs: list[AuditLog] = list(
                (await db.execute(select(AuditLog).where(AuditLog.entity_type == "student_telegram_link").order_by(AuditLog.id))).scalars()
            )
        chat_changes: list[tuple[str | None, str | None]] = [
            (log.old_value, log.new_value) for log in logs if log.field_name == "parent_telegram_chat_id"
        ]
        assert chat_changes == [(None, "31"), ("31", "32")]
        assert len([log for log in logs if log.field_name == "link_code_expires_at"]) == 2
        for log in logs:
            assert first.code not in f"{log.old_value}{log.new_value}"
            assert second.code not in f"{log.old_value}{log.new_value}"

    @pytest.mark.asyncio
    async def test_language_persists_and_updates_per_chat(self) -> None:
        async with TestingSessionLocal() as db:
            service: TelegramLinkService = TelegramLinkService(db)
            assert await service.get_language(5) is None
            await service.set_language(5, "tg")
            await service.set_language(5, "en")
            await db.commit()
        async with TestingSessionLocal() as db:
            assert await TelegramLinkService(db).get_language(5) == "en"
            rows: list[TelegramChatPreference] = list((await db.execute(select(TelegramChatPreference))).scalars())
            assert len(rows) == 1
            with pytest.raises(ValueError):
                await TelegramLinkService(db).set_language(5, "de")


class TestBotConversation:
    @pytest.mark.asyncio
    async def test_start_offers_three_languages_and_prompts_in_selected_language(
        self, conversation: TelegramConversation
    ) -> None:
        await conversation.send_text(500, "/start")
        assert conversation.session.sent_messages[0].has_inline_keyboard
        await conversation.press_language(500, "en")
        assert conversation.session.texts_for(500)[-1] == "Dear parent, please type the code you received."
        await conversation.send_text(500, "/language")
        await conversation.press_language(500, "tg")
        assert conversation.session.texts_for(500)[-1] == TelegramMessageCatalog().render("enter_code", "tg")
        await conversation.send_text(500, "garbage")
        assert conversation.session.texts_for(500)[-1] == TelegramMessageCatalog().render("invalid_format", "tg")
        async with TestingSessionLocal() as db:
            assert await TelegramLinkService(db).get_language(500) == "tg"

    @pytest.mark.asyncio
    async def test_text_without_language_asks_for_language_first(self, conversation: TelegramConversation) -> None:
        await conversation.send_text(501, "12A345")
        assert conversation.session.sent_messages[-1].has_inline_keyboard

    @pytest.mark.asyncio
    async def test_valid_code_links_and_confirms_with_student_name_in_language(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.send_text(510, "/start")
        await conversation.press_language(510, "ru")
        await conversation.send_text(510, f"  {issued.code.lower()} ")
        assert "Student One" in conversation.session.texts_for(510)[-1]
        assert "Готово" in conversation.session.texts_for(510)[-1]
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 510

    @pytest.mark.asyncio
    async def test_relink_replaces_chat_and_notifies_old_chat_in_its_language(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.press_language(520, "tg")
        await conversation.send_text(520, first.code)
        second: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.press_language(521, "en")
        await conversation.send_text(521, second.code)
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 521
        assert conversation.session.texts_for(520)[-1] == TelegramMessageCatalog().render(
            "link_moved", "tg", student_name="Student One"
        )
        assert "linked as the parent of Student One" in conversation.session.texts_for(521)[-1]

    @pytest.mark.asyncio
    async def test_relink_succeeds_even_if_old_chat_blocked_bot(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        first: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.press_language(530, "ru")
        await conversation.send_text(530, first.code)
        conversation.session.failing_chat_ids.add(530)
        second: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.press_language(531, "ru")
        await conversation.send_text(531, second.code)
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 531

    @pytest.mark.asyncio
    async def test_one_chat_can_link_several_students(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        async with TestingSessionLocal() as db:
            sibling: User = User(
                email="sibling@example.com", first_name="Sib", last_name="Ling", role=UserRole.STUDENT, must_set_password=False
            )
            db.add(sibling)
            await db.commit()
            sibling_id: int = sibling.id
        first: IssuedLinkCode = await issue_code(test_student.id)
        second: IssuedLinkCode = await issue_code(sibling_id)
        await conversation.press_language(540, "en")
        await conversation.send_text(540, first.code)
        await conversation.send_text(540, second.code)
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 540
        assert (await reload_student(sibling_id)).parent_telegram_chat_id == 540

    @pytest.mark.asyncio
    async def test_wrong_codes_lock_chat_after_five_even_for_correct_code(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        wrong_code: str = "00000Z" if issued.code != "00000Z" else "00000Y"
        await conversation.press_language(550, "en")
        for _ in range(5):
            await conversation.send_text(550, wrong_code)
        assert conversation.session.texts_for(550)[-1] == TelegramMessageCatalog().render("invalid_code", "en")
        await conversation.send_text(550, wrong_code)
        assert conversation.session.texts_for(550)[-1] == TelegramMessageCatalog().render("locked", "en")
        await conversation.send_text(550, issued.code)
        assert conversation.session.texts_for(550)[-1] == TelegramMessageCatalog().render("locked", "en")
        assert (await reload_student(test_student.id)).parent_telegram_chat_id is None
        await conversation.press_language(551, "en")
        await conversation.send_text(551, issued.code)
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 551

    @pytest.mark.asyncio
    async def test_successful_link_does_not_consume_attempt_budget(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        await conversation.press_language(560, "en")
        for _ in range(4):
            issued: IssuedLinkCode = await issue_code(test_student.id)
            await conversation.send_text(560, issued.code)
        assert (await reload_student(test_student.id)).parent_telegram_chat_id == 560
        issued = await issue_code(test_student.id)
        await conversation.send_text(560, issued.code)
        assert "linked as the parent" in conversation.session.texts_for(560)[-1]

    @pytest.mark.asyncio
    async def test_global_failure_bound_locks_every_chat(
        self, conversation: TelegramConversation, test_student: User, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(TelegramAttemptLimiter, "global_limit", 2)
        issued: IssuedLinkCode = await issue_code(test_student.id)
        wrong_code: str = "00000Z" if issued.code != "00000Z" else "00000Y"
        for chat_id in (570, 571):
            await conversation.press_language(chat_id, "en")
            await conversation.send_text(chat_id, wrong_code)
        await conversation.press_language(572, "en")
        await conversation.send_text(572, issued.code)
        assert conversation.session.texts_for(572)[-1] == TelegramMessageCatalog().render("locked", "en")
        assert (await reload_student(test_student.id)).parent_telegram_chat_id is None

    @pytest.mark.asyncio
    async def test_group_chats_are_ignored(self, conversation: TelegramConversation, test_student: User) -> None:
        issued: IssuedLinkCode = await issue_code(test_student.id)
        await conversation.send_text(-900, "/start", chat_type="group")
        await conversation.send_text(-900, issued.code, chat_type="group")
        assert conversation.session.sent_messages == []
        assert (await reload_student(test_student.id)).parent_telegram_chat_id is None

    @pytest.mark.asyncio
    async def test_contact_sharing_flow_is_removed(self) -> None:
        assert not hasattr(start_module, "process_contact")
        assert not hasattr(start_module, "cmd_start")


class TestEndpoints:
    @pytest.mark.asyncio
    async def test_admin_generates_code_once_and_student_exposes_only_flag_and_expiry(
        self, client: AsyncClient, test_admin: User, test_student: User
    ) -> None:
        response = await client.post(
            f"/api/v1/students/{test_student.id}/telegram-link-code", headers=admin_headers(test_admin)
        )
        assert response.status_code == 201
        body: dict[str, Any] = response.json()
        assert TelegramLinkCodeGenerator().normalize(body["code"]) == body["code"]
        listing = await client.get("/api/v1/students/", headers=admin_headers(test_admin))
        item: dict[str, Any] = listing.json()["items"][0]
        assert item["parent_linked"] is False
        assert item["parent_link_code_expires_at"] is not None
        assert body["code"] not in listing.text
        assert "code_hash" not in listing.text
        profile = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=admin_headers(test_admin))
        assert profile.json()["user"]["parent_linked"] is False
        assert body["code"] not in profile.text

    @pytest.mark.asyncio
    async def test_endpoint_is_superadmin_only(
        self, client: AsyncClient, test_mentor: User, test_student: User, test_accountant: User
    ) -> None:
        url: str = f"/api/v1/students/{test_student.id}/telegram-link-code"
        assert (await client.post(url)).status_code in (401, 403)
        mentor = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_mentor.id, UserRole.MENTOR)}"})
        student = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"})
        accountant = await client.post(url, headers={"Authorization": f"Bearer {create_access_token(test_accountant.id, UserRole.ACCOUNTANT)}"})
        assert mentor.status_code == 403
        assert student.status_code == 403
        assert accountant.status_code == 403

    @pytest.mark.asyncio
    async def test_unknown_or_non_student_target_is_404(
        self, client: AsyncClient, test_admin: User, test_mentor: User
    ) -> None:
        missing = await client.post("/api/v1/students/999999/telegram-link-code", headers=admin_headers(test_admin))
        not_student = await client.post(
            f"/api/v1/students/{test_mentor.id}/telegram-link-code", headers=admin_headers(test_admin)
        )
        assert missing.status_code == 404
        assert not_student.status_code == 404

    @pytest.mark.asyncio
    async def test_registering_a_student_generates_a_code_and_mentor_gets_none(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession
    ) -> None:
        student_response = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "new-student@example.com", "first_name": "New", "last_name": "Kid", "role": "student"},
        )
        mentor_response = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "new-mentor@example.com", "first_name": "New", "last_name": "Mentor", "role": "mentor"},
        )
        assert student_response.status_code == 201
        assert student_response.json()["parent_link_code_expires_at"] is not None
        assert student_response.json()["parent_linked"] is False
        assert mentor_response.json()["parent_link_code_expires_at"] is None
        rows: list[TelegramLinkCode] = list((await db_session.execute(select(TelegramLinkCode))).scalars())
        assert [row.student_id for row in rows] == [student_response.json()["id"]]


class TestRegistrationDelivery:
    @pytest.mark.asyncio
    async def test_create_response_carries_a_code_that_links_and_reads_never_do(
        self, client: AsyncClient, test_admin: User, conversation: TelegramConversation
    ) -> None:
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "delivered@example.com", "first_name": "Del", "last_name": "Ivered", "role": "student"},
        )
        body: dict[str, Any] = created.json()
        code: str = body["parent_link_code"]
        assert TelegramLinkCodeGenerator().normalize(code) == code
        listing = await client.get("/api/v1/students/", headers=admin_headers(test_admin))
        profile = await client.get(f"/api/v1/students/{body['id']}/profile", headers=admin_headers(test_admin))
        patched = await client.patch(
            f"/api/v1/users/{body['id']}", headers=admin_headers(test_admin), json={"first_name": "Dell"}
        )
        for read in (listing, profile, patched):
            assert '"parent_link_code"' not in read.text
            assert code not in read.text
        await conversation.press_language(600, "en")
        await conversation.send_text(600, code)
        assert (await reload_student(body["id"])).parent_telegram_chat_id == 600

    @pytest.mark.asyncio
    async def test_mentor_creation_has_no_link_code(self, client: AsyncClient, test_admin: User) -> None:
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "m2@example.com", "first_name": "M", "last_name": "Two", "role": "mentor"},
        )
        assert created.json()["parent_link_code"] is None

    @pytest.mark.asyncio
    async def test_credentials_email_contains_code_row_and_bot_hint(
        self, client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import json
        from app.core.config import settings
        from app.models.outbox_event import OutboxEvent, OutboxEventKind
        from app.services.email_templates import OutboxEmailTemplateFactory, RenderedEmail
        from app.services.outbox_service import OutboxPayloadEncryptor

        monkeypatch.setattr(settings, "TELEGRAM_BOT_USERNAME", "kitob_test_bot")
        created = await client.post(
            "/api/v1/users/",
            headers=admin_headers(test_admin),
            json={"email": "mailed@example.com", "first_name": "Mail", "last_name": "Ed", "role": "student"},
        )
        code: str = created.json()["parent_link_code"]
        event: OutboxEvent = (
            await db_session.execute(select(OutboxEvent).where(OutboxEvent.kind == OutboxEventKind.CREDENTIALS_EMAIL))
        ).scalars().one()
        assert event.encrypted_payload is not None
        payload: str = OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload)
        assert json.loads(payload)["parent_link_code"] == code
        rendered: RenderedEmail = OutboxEmailTemplateFactory().create(event.kind, event.recipient_email, payload).render()
        assert "Код для Telegram родителя" in rendered.html_body
        assert rendered.html_body.count(code) == 1
        assert "Передайте код родителю, чтобы подключить уведомления в боте @kitob_test_bot." in rendered.html_body
        assert code in rendered.plain_text

    def test_email_without_code_is_unchanged(self) -> None:
        from app.services.email_templates import CredentialsEmailTemplate, RenderedEmail

        rendered: RenderedEmail = CredentialsEmailTemplate("A", "a@example.com", "123456", "https://x.example").render()
        assert "Telegram" not in rendered.html_body


class TestSecurityBound:
    def test_expected_guesses_against_a_thousand_active_codes_stay_bounded(self) -> None:
        code_space: int = 10 ** 5 * len(TelegramLinkCodeGenerator.letter_alphabet) * 6
        validity_hours: float = TelegramLinkService.code_lifetime.total_seconds() / 3600
        expected_hits: float = TelegramAttemptLimiter.global_limit * validity_hours * 1000 / code_space
        assert code_space == 14_400_000
        assert validity_hours <= 72
        assert expected_hits < 0.5


class TestGlobalLockoutNotification:
    @pytest.mark.asyncio
    async def test_trip_notifies_each_admin_once_per_window_and_audits(
        self,
        conversation: TelegramConversation,
        test_admin: User,
        test_student: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.models.notification_log import NotificationLog, NotificationType

        monkeypatch.setattr(TelegramAttemptLimiter, "global_limit", 1)
        await conversation.press_language(610, "en")
        await conversation.send_text(610, "00000Z")
        for chat_id in (611, 612, 613):
            await conversation.press_language(chat_id, "en")
            await conversation.send_text(chat_id, "00000Z")
        async with TestingSessionLocal() as db:
            notifications: list[NotificationLog] = list(
                (await db.execute(select(NotificationLog).where(NotificationLog.type == NotificationType.TELEGRAM_LINK_LOCKOUT))).scalars()
            )
            audits: list[AuditLog] = list(
                (await db.execute(select(AuditLog).where(AuditLog.field_name == "global_failed_attempt_limit"))).scalars()
            )
        assert [notification.user_id for notification in notifications] == [test_admin.id]
        assert len(audits) == 1
