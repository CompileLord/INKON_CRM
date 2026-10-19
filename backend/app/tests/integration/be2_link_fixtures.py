import pytest
from aiogram import Bot
from app.core.security import create_access_token
from app.models.user import User, UserRole
from app.services.telegram_link_service import IssuedLinkCode, TelegramLinkService
from app.telegram_bot.bot import dp as application_dispatcher
from be2_telegram_support import FakeTelegramSession, TelegramConversation
from conftest import TestingSessionLocal


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
