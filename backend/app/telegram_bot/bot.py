from aiogram import Bot, Dispatcher
from app.core.config import settings
from app.telegram_bot.handlers.start import router as start_router

bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
dp = Dispatcher()

dp.include_router(start_router)
