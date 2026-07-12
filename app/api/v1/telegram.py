from fastapi import APIRouter, Request
from aiogram.types import Update
from app.telegram_bot.bot import bot, dp

router = APIRouter()


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    try:
        update_dict = await request.json()
        update = Update.model_validate(update_dict, context={"bot": bot})
        await dp.feed_update(bot, update)
    except Exception:
        pass
    return {"status": "ok"}
