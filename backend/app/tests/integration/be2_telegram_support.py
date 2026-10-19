import itertools
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator
from aiogram import Bot, Dispatcher
from aiogram.client.session.base import BaseSession
from aiogram.methods import AnswerCallbackQuery, SendMessage, TelegramMethod
from aiogram.types import Message, Update


@dataclass(frozen=True)
class SentMessage:
    chat_id: int
    text: str
    has_inline_keyboard: bool


class FakeTelegramSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.sent_messages: list[SentMessage] = []
        self.failing_chat_ids: set[int] = set()
        self._message_ids: itertools.count = itertools.count(1000)

    async def close(self) -> None:
        return None

    async def stream_content(self, *args: Any, **kwargs: Any) -> AsyncGenerator[bytes, None]:
        yield b""

    async def make_request(self, bot: Bot, method: TelegramMethod[Any], timeout: int | None = None) -> Any:
        if isinstance(method, SendMessage):
            chat_id: int = int(method.chat_id)
            if chat_id in self.failing_chat_ids:
                from aiogram.exceptions import TelegramForbiddenError
                raise TelegramForbiddenError(method=method, message="Forbidden: bot was blocked by the user")
            self.sent_messages.append(
                SentMessage(chat_id=chat_id, text=method.text, has_inline_keyboard=method.reply_markup is not None)
            )
            return Message.model_validate(
                {
                    "message_id": next(self._message_ids),
                    "date": int(datetime.now(timezone.utc).timestamp()),
                    "chat": {"id": chat_id, "type": "private"},
                    "text": method.text,
                },
                context={"bot": bot},
            )
        if isinstance(method, AnswerCallbackQuery):
            return True
        raise AssertionError(f"Unexpected Telegram method {type(method).__name__}")

    def texts_for(self, chat_id: int) -> list[str]:
        return [sent.text for sent in self.sent_messages if sent.chat_id == chat_id]


class TelegramConversation:
    def __init__(self, dispatcher: Dispatcher, bot: Bot, session: FakeTelegramSession) -> None:
        self.dispatcher: Dispatcher = dispatcher
        self.bot: Bot = bot
        self.session: FakeTelegramSession = session
        self._update_ids: itertools.count = itertools.count(1)

    async def send_text(self, chat_id: int, text: str, chat_type: str = "private") -> None:
        update: Update = Update.model_validate(
            {
                "update_id": next(self._update_ids),
                "message": {
                    "message_id": next(self._update_ids),
                    "date": int(datetime.now(timezone.utc).timestamp()),
                    "chat": {"id": chat_id, "type": chat_type},
                    "from": {"id": chat_id, "is_bot": False, "first_name": "Parent"},
                    "text": text,
                    **({"entities": [{"type": "bot_command", "offset": 0, "length": len(text)}]} if text.startswith("/") else {}),
                },
            },
            context={"bot": self.bot},
        )
        await self.dispatcher.feed_update(self.bot, update)

    async def press_language(self, chat_id: int, language: str) -> None:
        update: Update = Update.model_validate(
            {
                "update_id": next(self._update_ids),
                "callback_query": {
                    "id": str(next(self._update_ids)),
                    "from": {"id": chat_id, "is_bot": False, "first_name": "Parent"},
                    "chat_instance": "instance",
                    "data": f"lang:{language}",
                    "message": {
                        "message_id": next(self._update_ids),
                        "date": int(datetime.now(timezone.utc).timestamp()),
                        "chat": {"id": chat_id, "type": "private"},
                        "text": "Choose",
                    },
                },
            },
            context={"bot": self.bot},
        )
        await self.dispatcher.feed_update(self.bot, update)
