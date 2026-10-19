import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiogram import Bot, Dispatcher
from aiogram.types import User

from app.telegram_bot.bot import bot, dp


class TelegramPollingRunner:
    def __init__(self, telegram_bot: Bot, dispatcher: Dispatcher) -> None:
        self.telegram_bot: Bot = telegram_bot
        self.dispatcher: Dispatcher = dispatcher
        self.logger: logging.Logger = logging.getLogger("telegram_polling")

    async def run(self) -> None:
        identity: User = await self.telegram_bot.get_me()
        self.logger.info("Connected as @%s, removing webhook and starting long polling", identity.username)
        await self.telegram_bot.delete_webhook(drop_pending_updates=False)
        try:
            await self.dispatcher.start_polling(self.telegram_bot, handle_signals=True)
        finally:
            await self.telegram_bot.session.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(TelegramPollingRunner(bot, dp).run())
