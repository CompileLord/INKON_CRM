import asyncio
from typing import Optional, Protocol


class TelegramBotIdentity(Protocol):
    username: Optional[str]


class TelegramBotClient(Protocol):
    async def get_me(self) -> TelegramBotIdentity: ...


class TelegramStatusService:
    CHECK_TIMEOUT_SECONDS: float = 5.0

    def __init__(self, bot_client: TelegramBotClient) -> None:
        self.bot_client = bot_client

    async def check_bot(self) -> dict:
        try:
            identity: TelegramBotIdentity = await asyncio.wait_for(self.bot_client.get_me(), timeout=self.CHECK_TIMEOUT_SECONDS)
        except Exception:
            return {"reachable": False, "bot_username": None}
        return {"reachable": True, "bot_username": identity.username}
