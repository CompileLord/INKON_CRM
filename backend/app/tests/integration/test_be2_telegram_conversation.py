import pytest
from sqlalchemy import select
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole
from app.services.telegram_link_service import IssuedLinkCode, TelegramLinkService
from app.services.telegram_attempt_limiter import TelegramAttemptLimiter
from app.telegram_bot.messages import TelegramMessageCatalog
from be2_telegram_support import TelegramConversation
from conftest import TestingSessionLocal
import app.telegram_bot.handlers.start as start_module


from be2_link_fixtures import bind_handler_sessions, conversation, issue_code, reload_student


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
    async def test_global_failure_bound_defaults_to_twenty_per_hour(
        self, conversation: TelegramConversation, test_student: User
    ) -> None:
        assert TelegramAttemptLimiter.global_limit == 20
        assert TelegramAttemptLimiter.window_seconds == 3600
        issued: IssuedLinkCode = await issue_code(test_student.id)
        wrong_code: str = "00000Z" if issued.code != "00000Z" else "00000Y"
        for chat_id in (1000, 1001, 1002, 1003):
            await conversation.press_language(chat_id, "en")
            for _ in range(TelegramAttemptLimiter.chat_limit):
                await conversation.send_text(chat_id, wrong_code)
        await conversation.press_language(1004, "en")
        await conversation.send_text(1004, issued.code)
        assert conversation.session.texts_for(1004)[-1] == TelegramMessageCatalog().render("locked", "en")
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
