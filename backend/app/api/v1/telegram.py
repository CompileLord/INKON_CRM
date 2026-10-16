import json
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import Update
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import ValidationError

from app.telegram_bot.bot import bot, dp
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class TelegramWebhookProcessor:
    def __init__(self, telegram_bot: Bot, dispatcher: Dispatcher) -> None:
        self.telegram_bot: Bot = telegram_bot
        self.dispatcher: Dispatcher = dispatcher

    async def process(self, request: Request) -> None:
        try:
            update_payload = await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed JSON body",
            ) from None

        try:
            update: Update = Update.model_validate(
                update_payload,
                context={"bot": self.telegram_bot},
            )
        except ValidationError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid Telegram update",
            ) from None

        try:
            await self.dispatcher.feed_update(self.telegram_bot, update)
        except Exception:
            logger.error("Telegram webhook processing failed")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Telegram update processing failed",
            ) from None


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    if not settings.TELEGRAM_BOT_SECRET_TOKEN or secret_token != settings.TELEGRAM_BOT_SECRET_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid secret token"
        )
    await TelegramWebhookProcessor(bot, dp).process(request)
    return {"status": "ok"}
