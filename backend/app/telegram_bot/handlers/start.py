import logging
from aiogram import F, Router, types
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy.ext.asyncio import AsyncSession
import app.db.session as session_module
from app.core.telegram_link_codes import TelegramLinkCodeGenerator
from app.services.telegram_attempt_limiter import AttemptDecision, TelegramAttemptLimiter
from app.services.telegram_link_service import LinkOutcome, LinkResult, TelegramLinkService
from app.telegram_bot.messages import TelegramMessageCatalog

logger: logging.Logger = logging.getLogger(__name__)

router: Router = Router()
catalog: TelegramMessageCatalog = TelegramMessageCatalog()
code_generator: TelegramLinkCodeGenerator = TelegramLinkCodeGenerator()
LANGUAGE_CALLBACK_PREFIX: str = "lang:"


def open_session() -> AsyncSession:
    return session_module.AsyncSessionLocal()


def build_language_keyboard() -> InlineKeyboardMarkup:
    buttons: list[InlineKeyboardButton] = [
        InlineKeyboardButton(text=label, callback_data=f"{LANGUAGE_CALLBACK_PREFIX}{code}")
        for code, label in catalog.language_buttons
    ]
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


async def read_language(chat_id: int) -> str | None:
    async with open_session() as db:
        return await TelegramLinkService(db).get_language(chat_id)


async def send_language_prompt(message: types.Message) -> None:
    await message.answer(catalog.language_choice_prompt(), reply_markup=build_language_keyboard())


@router.message(CommandStart(), F.chat.type == "private")
@router.message(Command("language"), F.chat.type == "private")
async def choose_language(message: types.Message) -> None:
    await send_language_prompt(message)


@router.callback_query(F.data.startswith(LANGUAGE_CALLBACK_PREFIX))
async def language_selected(callback: types.CallbackQuery) -> None:
    language: str = (callback.data or "").removeprefix(LANGUAGE_CALLBACK_PREFIX)
    chat = callback.message.chat if callback.message is not None else None
    if chat is None or chat.type != "private" or language not in dict(catalog.language_buttons):
        await callback.answer()
        return
    async with open_session() as db:
        await TelegramLinkService(db).set_language(chat.id, language)
        await db.commit()
    await callback.answer()
    await callback.message.answer(catalog.render("enter_code", language))


@router.message(F.text, F.chat.type == "private")
async def receive_code(message: types.Message) -> None:
    chat_id: int = message.chat.id
    language: str | None = await read_language(chat_id)
    if language is None:
        await send_language_prompt(message)
        return
    normalized_code: str | None = code_generator.normalize(message.text or "")
    if normalized_code is None:
        await message.answer(catalog.render("invalid_format", language))
        return
    limiter: TelegramAttemptLimiter = TelegramAttemptLimiter()
    decision: AttemptDecision = await limiter.reserve_attempt(chat_id)
    if decision is AttemptDecision.GLOBALLY_LOCKED:
        async with open_session() as db:
            await TelegramLinkService(db).report_global_lockout()
    if decision is not AttemptDecision.ALLOWED:
        await message.answer(catalog.render("locked", language))
        return
    result: LinkResult
    replaced_language: str | None = None
    async with open_session() as db:
        service: TelegramLinkService = TelegramLinkService(db)
        result = await service.link_parent_chat(chat_id, normalized_code)
        if result.outcome is LinkOutcome.LINKED:
            if result.replaced_chat_id is not None:
                replaced_language = await service.get_language(result.replaced_chat_id)
            await db.commit()
        else:
            await db.rollback()
    if result.outcome is not LinkOutcome.LINKED:
        await message.answer(catalog.render("invalid_code", language))
        return
    await limiter.release_successful_attempt(chat_id)
    student_name: str = result.student_name or ""
    await message.answer(catalog.render("linked", language, student_name=student_name))
    if result.replaced_chat_id is not None and message.bot is not None:
        try:
            await message.bot.send_message(
                result.replaced_chat_id,
                catalog.render("link_moved", replaced_language, student_name=student_name),
            )
        except TelegramAPIError:
            logger.warning("Previous parent chat could not be notified about a moved link")

