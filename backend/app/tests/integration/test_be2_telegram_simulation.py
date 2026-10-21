import pytest
from aiogram import Bot
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.telegram_bot.bot import dp as application_dispatcher
from be2_telegram_support import FakeTelegramSession, TelegramConversation
from conftest import TestingSessionLocal
import app.db.session as session_module


@pytest.mark.asyncio
async def test_real_parent_journey_is_logged(
    client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(session_module, "AsyncSessionLocal", TestingSessionLocal)
    session: FakeTelegramSession = FakeTelegramSession()
    bot: Bot = Bot(token="123456:test", session=session)
    conversation: TelegramConversation = TelegramConversation(application_dispatcher, bot, session)
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, UserRole.SUPERADMIN)}"}
    transcript: list[str] = []

    async def say(chat_id: int, text: str) -> None:
        before: int = len(session.sent_messages)
        await conversation.send_text(chat_id, text)
        transcript.append(f"chat {chat_id} -> {text if text.startswith('/') else '<code>'}")
        for sent in session.sent_messages[before:]:
            transcript.append(f"    bot to {sent.chat_id}: {sent.text}")

    async def press(chat_id: int, language: str) -> None:
        before: int = len(session.sent_messages)
        await conversation.press_language(chat_id, language)
        transcript.append(f"chat {chat_id} pressed language button {language}")
        for sent in session.sent_messages[before:]:
            transcript.append(f"    bot to {sent.chat_id}: {sent.text}")

    created = await client.post(
        "/api/v1/users/", headers=headers,
        json={"email": "sim-student@example.com", "first_name": "Aziza", "last_name": "Rahimova", "role": "student", "phone": "+992900000999"},
    )
    student_id: int = created.json()["id"]
    transcript.append(f"student registered id={student_id} parent_linked={created.json()['parent_linked']} expiry={created.json()['parent_link_code_expires_at']}")
    first_code: str = (await client.post(f"/api/v1/students/{student_id}/telegram-link-code", headers=headers)).json()["code"]
    transcript.append("admin generated code A (plaintext shown once, not logged)")

    await say(1001, "/start")
    await press(1001, "ru")
    await say(1001, "00000A")
    await say(1001, "11111B")
    await say(1001, first_code)
    linked = (await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)).json()["user"]
    transcript.append(f"profile parent_linked={linked['parent_linked']} chat={linked['parent_telegram_chat_id']}")
    assert linked["parent_telegram_chat_id"] == 1001

    second_code: str = (await client.post(f"/api/v1/students/{student_id}/telegram-link-code", headers=headers)).json()["code"]
    transcript.append("admin generated code B")
    await say(1002, "/start")
    await press(1002, "en")
    await say(1002, second_code)
    relinked = (await client.get(f"/api/v1/students/{student_id}/profile", headers=headers)).json()["user"]
    transcript.append(f"profile chat={relinked['parent_telegram_chat_id']}")
    assert relinked["parent_telegram_chat_id"] == 1002
    assert any("перенесена" in text for text in session.texts_for(1001))

    await say(1003, "/start")
    await press(1003, "tg")
    for attempt in range(1, 7):
        transcript.append(f"wrong attempt {attempt}")
        await say(1003, f"2222{attempt}C")
    assert "кӯшиш кунед" in session.texts_for(1003)[-1]

    with capsys.disabled():
        print("\n" + "\n".join(transcript))
