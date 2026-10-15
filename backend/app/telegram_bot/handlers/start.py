from aiogram import Router, types, F
from aiogram.filters import CommandStart
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from app.db.session import AsyncSessionLocal
from app.services.user_service import UserService

router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message) -> None:
    kb = [
        [KeyboardButton(text="Поделиться контактом", request_contact=True)]
    ]
    keyboard = ReplyKeyboardMarkup(keyboard=kb, resize_keyboard=True, one_time_keyboard=True)
    await message.answer(
        "Пожалуйста, поделитесь своим контактом, чтобы привязать ваш Telegram-аккаунт в качестве родителя.",
        reply_markup=keyboard
    )


@router.message(F.contact)
async def process_contact(message: types.Message) -> None:
    if message.chat.type != "private":
        return
    if (
        message.contact is None
        or message.from_user is None
        or message.chat.id != message.from_user.id
        or message.contact.user_id != message.from_user.id
    ):
        await message.answer(
            "Вы можете поделиться только своим собственным контактом."
        )
        return

    student_names: list[str] = []
    async with AsyncSessionLocal() as db:
        student_names = await UserService(db).bind_parent_telegram_contact(
            message.contact.phone_number,
            message.chat.id,
        )

        if student_names:
            await db.commit()

    if not student_names:
        await message.answer(
            "Студент с таким номером телефона не найден. Пожалуйста, обратитесь в администрацию для проверки контактных данных."
        )
        return

    names_str = ", ".join(student_names)
    await message.answer(
        f"Вы успешно привязаны в качестве родителя для: {names_str}. Теперь вы будете получать уведомления об успеваемости и оплате обучения."
    )
