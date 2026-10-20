import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Protocol
from zoneinfo import ZoneInfo
from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.models.debt_reminder_notification import DebtReminderNotification
from app.repositories.interfaces.debt_reminder_repository import DebtReminderSource
from app.repositories.sqlalchemy.debt_reminder_repository import SQLAlchemyDebtReminderRepository
from app.repositories.sqlalchemy.debt_reminder_delivery_repository import SQLAlchemyDebtReminderDeliveryRepository
from app.telegram_bot.messages import TelegramMessageCatalog


class DebtReminderSender(Protocol):
    async def send_text(self, chat_id: int, text: str) -> None: ...


class AiogramDebtReminderSender:
    def __init__(self, bot: Bot) -> None:
        self._bot: Bot = bot

    async def send_text(self, chat_id: int, text: str) -> None:
        await self._bot.send_message(chat_id, text, parse_mode=None)


class DebtReminderDeliveryWorker:
    def __init__(
        self, session_factory: async_sessionmaker[AsyncSession], sender: DebtReminderSender,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._session_factory: async_sessionmaker[AsyncSession] = session_factory
        self._sender: DebtReminderSender = sender
        self._clock: Callable[[], datetime] = clock
        self._catalog: TelegramMessageCatalog = TelegramMessageCatalog()

    async def run_once(self) -> int:
        owner: str = secrets.token_hex(16)
        now: datetime = self._clock()
        async with self._session_factory() as session:
            await SQLAlchemyDebtReminderDeliveryRepository(session).release_stale_claims(now)
            await session.commit()
        async with self._session_factory() as session:
            claimed: list[DebtReminderNotification] = list(
                await SQLAlchemyDebtReminderDeliveryRepository(session).claim_due_batch(owner, now)
            )
            await session.commit()
        notification: DebtReminderNotification
        for notification in claimed:
            await self.deliver(notification, owner)
        return len(claimed)

    async def settle(
        self, notification: DebtReminderNotification, owner: str, status: str,
        reason: str | None = None, next_due_at: datetime | None = None,
    ) -> None:
        async with self._session_factory() as session:
            await SQLAlchemyDebtReminderDeliveryRepository(session).settle(
                notification.id, owner, status, self._clock(), reason, next_due_at
            )
            await session.commit()

    async def deliver(self, notification: DebtReminderNotification, owner: str) -> None:
        async with self._session_factory() as session:
            source: DebtReminderSource | None = await SQLAlchemyDebtReminderRepository(session).load_source(
                notification.student_id, self._clock().astimezone(ZoneInfo("Asia/Dushanbe")).date()
            )
        if source is None or source.parent_chat_id is None or source.total_debt <= 0:
            await self.settle(notification, owner, "skipped", "no_current_debt_or_parent")
            return
        text: str = self.render(source)
        async with self._session_factory() as session:
            started: bool = await SQLAlchemyDebtReminderDeliveryRepository(session).mark_send_started(
                notification.id, owner, self._clock()
            )
            await session.commit()
        if not started:
            return
        try:
            await self._sender.send_text(source.parent_chat_id, text)
        except TelegramForbiddenError:
            await self.settle(notification, owner, "failed", "parent_chat_unavailable")
            return
        except TelegramRetryAfter as error:
            await self.retry(notification, owner, error, error.retry_after)
            return
        except Exception as error:
            await self.retry(notification, owner, error)
            return
        await self.settle(notification, owner, "sent")

    def render(self, source: DebtReminderSource) -> str:
        language: str = self._catalog.resolve_language(source.parent_language)
        currency: str = self._catalog.render("debt_currency", language)
        lines: str = "\n".join(f"{title}: {amount:.2f} {currency}" for title, amount in source.courses)
        return self._catalog.render("debt_reminder", language, student_name=source.student_name,
                                    amount=format(source.total_debt, ".2f"), currency=currency, courses=lines)

    async def retry(
        self, notification: DebtReminderNotification, owner: str, error: Exception, retry_after: int = 0,
    ) -> None:
        if notification.attempt_count >= notification.max_attempts:
            await self.settle(notification, owner, "failed", type(error).__name__)
            return
        delay: int = max(min(60 * 2 ** (notification.attempt_count - 1), 3600), retry_after)
        await self.settle(notification, owner, "pending", type(error).__name__, self._clock() + timedelta(seconds=delay))


async def deliver_due_debt_reminders(ctx: dict[str, Any]) -> int:
    from app.db.session import AsyncSessionLocal
    from app.telegram_bot.bot import bot

    return await DebtReminderDeliveryWorker(AsyncSessionLocal, AiogramDebtReminderSender(bot)).run_once()
