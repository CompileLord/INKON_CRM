from aiogram import Router, types, F
from aiogram.filters import CommandStart
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole

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
    if message.contact.user_id != message.from_user.id:
        await message.answer(
            "Вы можете поделиться только своим собственным контактом."
        )
        return
    phone = message.contact.phone_number
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    if cleaned and not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    
    cleaned_without = cleaned.lstrip("+")
    
    async with AsyncSessionLocal() as db:
        query = select(User).filter(
            User.role == UserRole.STUDENT,
            User.phone.in_([cleaned, cleaned_without]),
            User.is_deleted == False
        )
        result = await db.execute(query)
        students = result.scalars().all()
        
        if not students:
            await message.answer(
                "Студент с таким номером телефона не найден. Пожалуйста, обратитесь в администрацию для проверки контактных данных."
            )
            return
        
        student_names = []
        for student in students:
            student.parent_telegram_chat_id = message.chat.id
            student_names.append(f"{student.first_name} {student.last_name}")
        
        await db.commit()
        
        names_str = ", ".join(student_names)
        await message.answer(
            f"Вы успешно привязаны в качестве родителя для: {names_str}. Теперь вы будете получать уведомления об успеваемости и оплате обучения."
        )
