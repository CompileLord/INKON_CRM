from datetime import datetime
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.telegram_link import TelegramChatPreference, TelegramLinkCode


class SQLAlchemyTelegramLinkCodeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def replace_code(self, student_id: int, code_hash: str, expires_at: datetime) -> None:
        await self.session.execute(
            delete(TelegramLinkCode).where(
                TelegramLinkCode.student_id == student_id,
                TelegramLinkCode.used_at.is_(None),
            )
        )
        self.session.add(TelegramLinkCode(student_id=student_id, code_hash=code_hash, expires_at=expires_at))
        await self.session.flush()

    async def consume(self, code_hash: str, now: datetime, chat_id: int) -> int | None:
        statement = (
            update(TelegramLinkCode)
            .where(
                TelegramLinkCode.code_hash == code_hash,
                TelegramLinkCode.used_at.is_(None),
                TelegramLinkCode.expires_at > now,
            )
            .values(used_at=now, used_by_chat_id=chat_id)
            .returning(TelegramLinkCode.student_id)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()


class SQLAlchemyTelegramChatPreferenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session: AsyncSession = session

    async def get_language(self, chat_id: int) -> str | None:
        statement = select(TelegramChatPreference.language).where(TelegramChatPreference.chat_id == chat_id)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def set_language(self, chat_id: int, language: str) -> None:
        insert_statement = postgresql_insert(TelegramChatPreference).values(chat_id=chat_id, language=language)
        upsert_statement = insert_statement.on_conflict_do_update(
            index_elements=[TelegramChatPreference.chat_id],
            set_={"language": language, "updated_at": func.now()},
        )
        await self.session.execute(upsert_statement)
