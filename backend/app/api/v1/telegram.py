from fastapi import APIRouter, Request, HTTPException, status
from aiogram.types import Update
from app.telegram_bot.bot import bot, dp
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if not settings.TELEGRAM_BOT_SECRET_TOKEN or secret_token != settings.TELEGRAM_BOT_SECRET_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid secret token"
        )
    try:
        update_dict = await request.json()
        update = Update.model_validate(update_dict, context={"bot": bot})
        await dp.feed_update(bot, update)
    except Exception as e:
        logger.error(f"Error handling Telegram webhook: {e}", exc_info=True)
    return {"status": "ok"}
