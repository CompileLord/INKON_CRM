from typing import Optional
from pydantic import BaseModel


class TelegramBotCheckResponse(BaseModel):
    reachable: bool
    bot_username: Optional[str] = None
