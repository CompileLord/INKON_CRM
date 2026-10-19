import logging
import secrets
import zoneinfo
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional
from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import BufferedInputFile
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from typing_extensions import Protocol
from app.core.config import settings
from app.models.exam_result_notification import ExamResultNotification
from app.repositories.interfaces.exam_result_notification_repository import ExamResultSource
from app.repositories.sqlalchemy.exam_result_notification_repository import SQLAlchemyExamResultNotificationRepository
from app.repositories.sqlalchemy.exam_result_source_repository import SQLAlchemyExamResultSourceRepository
from app.services.exam_result_image import ExamResultCardData, ExamResultSvgRenderer, ResvgPngRasterizer, SvgRasterizer
from app.telegram_bot.messages import TelegramMessageCatalog
from app.services.exam_result_scheduling_service import UNSET_EXAM_SCORE

logger: logging.Logger = logging.getLogger(__name__)

EXAM_RESULT_BATCH_SIZE: int = 20
EXAM_RESULT_LEASE_SECONDS: int = 180
EXAM_RESULT_BACKOFF_BASE_SECONDS: int = 60
EXAM_RESULT_BACKOFF_CAP_SECONDS: int = 3600


class ExamResultPhotoSender(Protocol):
    async def send_photo(self, chat_id: int, png_bytes: bytes, caption: str) -> None:
        ...


class AiogramExamResultPhotoSender:
    def __init__(self, bot: Bot) -> None:
        self._bot: Bot = bot

    async def send_photo(self, chat_id: int, png_bytes: bytes, caption: str) -> None:
        await self._bot.send_photo(
            chat_id,
            BufferedInputFile(png_bytes, filename="exam-result.png"),
            caption=caption,
        )


class ExamResultDeliveryWorker:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        sender: ExamResultPhotoSender,
        renderer: Optional[ExamResultSvgRenderer] = None,
        rasterizer: Optional[SvgRasterizer] = None,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        batch_size: int = EXAM_RESULT_BATCH_SIZE,
        lease_duration_seconds: int = EXAM_RESULT_LEASE_SECONDS,
    ) -> None:
        self._session_factory: async_sessionmaker[AsyncSession] = session_factory
        self._sender: ExamResultPhotoSender = sender
        self._renderer: ExamResultSvgRenderer = renderer or ExamResultSvgRenderer()
        self._rasterizer: SvgRasterizer = rasterizer or ResvgPngRasterizer()
        self._catalog: TelegramMessageCatalog = TelegramMessageCatalog()
        self._clock: Callable[[], datetime] = clock
        self._batch_size: int = batch_size
        self._lease_duration_seconds: int = lease_duration_seconds

    def compute_next_due_at(self, attempt_count: int, now: datetime) -> datetime:
        backoff_seconds: int = min(
            EXAM_RESULT_BACKOFF_BASE_SECONDS * (2 ** max(0, attempt_count - 1)),
            EXAM_RESULT_BACKOFF_CAP_SECONDS,
        )
        return now + timedelta(seconds=backoff_seconds)

    def resolve_skip_reason(self, source: Optional[ExamResultSource]) -> Optional[str]:
        if source is None:
            return "summary_not_found"
        if source.student_deleted:
            return "student_deleted"
        if source.course_deleted:
            return "course_deleted"
        if source.parent_chat_id is None:
            return "no_parent_chat"
        if source.exam_score == UNSET_EXAM_SCORE:
            return "exam_score_cleared"
        return None

    def build_card(self, source: ExamResultSource, now: datetime) -> ExamResultCardData:
        local_now: datetime = now.astimezone(zoneinfo.ZoneInfo(settings.TIMEZONE))
        return ExamResultCardData(
            student_name=source.student_name,
            course_title=source.course_title,
            period_label=source.period_label,
            exam_score=source.exam_score,
            exam_max_score=source.exam_max_score,
            total_score=source.sum_score,
            max_period_score=source.max_period_score,
            attendance_count=source.attendance_count,
            total_lessons=source.total_lessons,
            rendered_at=local_now,
        )

    async def run_once(self) -> int:
        lease_owner: str = secrets.token_hex(16)
        now: datetime = self._clock()
        async with self._session_factory() as session:
            await SQLAlchemyExamResultNotificationRepository(session).release_stale_claims(now)
            await session.commit()
        async with self._session_factory() as session:
            claimed: list[ExamResultNotification] = list(
                await SQLAlchemyExamResultNotificationRepository(session).claim_due_batch(
                    lease_owner, self._lease_duration_seconds, self._batch_size, now
                )
            )
            await session.commit()
        notification: ExamResultNotification
        for notification in claimed:
            await self.deliver(notification, lease_owner)
        return len(claimed)

    async def deliver(self, notification: ExamResultNotification, lease_owner: str) -> None:
        async with self._session_factory() as session:
            source: Optional[ExamResultSource] = await SQLAlchemyExamResultSourceRepository(session).load_source(
                notification.student_id, notification.journal_id
            )
        skip_reason: Optional[str] = self.resolve_skip_reason(source)
        if skip_reason is not None or source is None or source.parent_chat_id is None:
            await self.settle_skipped(notification.id, lease_owner, skip_reason or "summary_not_found")
            return
        language: str = self._catalog.resolve_language(source.parent_language)
        card: ExamResultCardData = self.build_card(source, self._clock())
        png_bytes: bytes = self._rasterizer.rasterize(self._renderer.render(card, language))
        caption: str = self._renderer.build_caption(card, language)
        async with self._session_factory() as session:
            started: bool = await SQLAlchemyExamResultNotificationRepository(session).mark_send_started(
                notification.id, lease_owner, self._clock()
            )
            await session.commit()
        if not started:
            return
        try:
            await self._sender.send_photo(source.parent_chat_id, png_bytes, caption)
        except TelegramForbiddenError:
            await self.settle_skipped(notification.id, lease_owner, "parent_chat_unavailable")
            return
        except Exception as error:
            await self.settle_retry(notification, lease_owner, error)
            return
        async with self._session_factory() as session:
            await SQLAlchemyExamResultNotificationRepository(session).mark_sent(
                notification.id, lease_owner, self._clock()
            )
            await session.commit()

    async def settle_skipped(self, notification_id: int, lease_owner: str, reason: str) -> None:
        async with self._session_factory() as session:
            await SQLAlchemyExamResultNotificationRepository(session).mark_skipped(
                notification_id, lease_owner, reason, self._clock()
            )
            await session.commit()

    async def settle_retry(self, notification: ExamResultNotification, lease_owner: str, error: Exception) -> None:
        now: datetime = self._clock()
        reached_maximum: bool = notification.attempt_count >= notification.max_attempts
        next_due_at: Optional[datetime] = None
        if not reached_maximum:
            next_due_at = self.compute_next_due_at(notification.attempt_count, now)
            if isinstance(error, TelegramRetryAfter):
                next_due_at = max(next_due_at, now + timedelta(seconds=error.retry_after))
        logger.warning("Exam result delivery failed: %s", type(error).__name__)
        async with self._session_factory() as session:
            await SQLAlchemyExamResultNotificationRepository(session).mark_retry(
                notification.id, lease_owner, type(error).__name__, next_due_at, now
            )
            await session.commit()
