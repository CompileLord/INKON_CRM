from datetime import datetime
from typing_extensions import Protocol


class TelegramLinkCodeRepository(Protocol):
    async def replace_code(self, student_id: int, code_hash: str, expires_at: datetime) -> None:
        ...

    async def consume(self, code_hash: str, now: datetime, chat_id: int) -> int | None:
        ...


class TelegramChatPreferenceRepository(Protocol):
    async def get_language(self, chat_id: int) -> str | None:
        ...

    async def set_language(self, chat_id: int, language: str) -> None:
        ...
