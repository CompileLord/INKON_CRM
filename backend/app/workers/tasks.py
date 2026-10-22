from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository
from datetime import date, datetime, timezone, timedelta
from typing import Any, Sequence
import zoneinfo
import logging
from sqlalchemy import Select, select, update, func, cast, Numeric
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.exc import IntegrityError
from decimal import Decimal
from collections.abc import AsyncIterator
from aiogram import Bot
from aiogram.types import InputFile
from aiogram.exceptions import TelegramForbiddenError, TelegramBadRequest

from app.db.session import AsyncSessionLocal
from app.core.config import settings
from app.models.user import User, UserRole
from app.models.course import Course, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.payment import Payment
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.document import Document, DocumentOwnerType
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from app.services.notification_service import ExamNotificationFingerprint, NotificationService
from app.services.email_service import EmailService
from app.services.email_templates import RenderedEmail, VerificationCodeEmailTemplate
from app.services.storage_service import STREAM_CHUNK_SIZE, StorageService, get_storage_service
from app.telegram_bot.bot import bot

logger = logging.getLogger(__name__)


async def send_verification_email_task(ctx, email: str, code: str) -> None:
    email_service = EmailService()
    rendered_email: RenderedEmail = VerificationCodeEmailTemplate(code=code).render()
    await email_service.send_email(
        email,
        rendered_email.subject,
        rendered_email.plain_text,
        html_body=rendered_email.html_body,
        inline_images=rendered_email.inline_images,
    )


async def send_email(ctx, to_email: str, subject: str, body: str) -> None:
    email_service = EmailService()
    await email_service.send_email(to_email, subject, body)


async def send_telegram_message(ctx: dict[str, Any] | None, chat_id: int, text: str, notification_id: int | None = None, revision: int | None = None) -> None:
    if notification_id is None:
        await bot.send_message(chat_id, text)
        return
    if revision is None:
        raise ValueError("Notification revision is required")
    db: AsyncSession
    async with AsyncSessionLocal() as db:
        service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))

        await service.deliver_queued_notification(notification_id, revision, bot.send_message)


class StreamedStorageInputFile(InputFile):
    def __init__(self, storage: StorageService, file_path: str, filename: str) -> None:
        super().__init__(filename=filename, chunk_size=STREAM_CHUNK_SIZE)
        self.storage: StorageService = storage
        self.file_path: str = file_path

    @classmethod
    async def open(cls, storage: StorageService, file_path: str, filename: str) -> "StreamedStorageInputFile | None":
        source: AsyncIterator[bytes] = storage.stream(file_path)
        try:
            await anext(source, b"")
        except (FileNotFoundError, ValueError):
            return None
        finally:
            await source.aclose()
        return cls(storage, file_path, filename)

    async def read(self, bot: Bot) -> AsyncIterator[bytes]:
        chunk: bytes
        async for chunk in self.storage.stream(self.file_path, self.chunk_size):
            yield chunk


async def send_exam_result_notification_task(ctx: dict[str, Any] | None, student_id: int, journal_id: int, notification_id: int | None = None, revision: int | None = None) -> None:
    if notification_id is not None and revision is None:
        raise ValueError("Notification revision is required")
    db: AsyncSession
    async with AsyncSessionLocal() as db:
        stmt: Select[tuple[JournalStudentSummary]] = (
            select(JournalStudentSummary)
            .options(
                joinedload(JournalStudentSummary.student),
                joinedload(JournalStudentSummary.journal).joinedload(Journal.course),
            )
            .filter(JournalStudentSummary.student_id == student_id, JournalStudentSummary.journal_id == journal_id)
        )
        res: Result[tuple[JournalStudentSummary]] = await db.execute(stmt)
        summary: JournalStudentSummary | None = res.scalars().first()
        if not summary:
            if notification_id is not None and revision is not None:
                await NotificationService(SQLAlchemyNotificationLogRepository(db)).reject_notification(
                    notification_id, revision, "source_unavailable"
                )
            return

        student: User = summary.student
        if student.is_deleted or summary.journal.course.is_deleted:
            if notification_id is not None and revision is not None:
                await NotificationService(SQLAlchemyNotificationLogRepository(db)).reject_notification(
                    notification_id, revision, "source_deleted"
                )
            return
        if not student.parent_telegram_chat_id:
            if notification_id is not None and revision is not None:
                await NotificationService(SQLAlchemyNotificationLogRepository(db)).reject_notification(
                    notification_id, revision, "source_unavailable"
                )
            logger.warning(f"Parent telegram chat ID not set for student {student.id}")
            return

        journal: Journal = summary.journal
        course: Course = journal.course

        doc_stmt: Select[tuple[Document]] = select(Document).filter(
            Document.owner_type == DocumentOwnerType.STUDENT,
            Document.owner_id == student_id,
            Document.journal_id == journal_id,
            Document.is_deleted == False,
        ).order_by(Document.uploaded_at.desc(), Document.id.desc()).limit(1)
        doc_res: Result[tuple[Document]] = await db.execute(doc_stmt)
        document: Document | None = doc_res.scalars().first()

        notification_service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))
        fingerprint: str = ExamNotificationFingerprint.build((
            summary.version, summary.sum_score, summary.max_period_score, summary.attendance_count,
            summary.total_lessons, journal.period_label, course.title,
            document.id if document is not None else 0, document.file_path if document is not None else "",
        ))
        recipient: str = str(student.parent_telegram_chat_id)
        notification_date: date = date.today()
        if notification_id is not None:
            recovered_log: NotificationLog | None = await notification_service.repo.get_by_id(notification_id)
            if recovered_log is None or (recovered_log.revision or 1) != revision:
                return
            if (
                recovered_log.user_id != student_id
                or (recovered_log.source_journal_id if recovered_log.source_journal_id is not None else recovered_log.related_entity_id) != journal_id
                or (recovered_log.source_journal_id is not None and recovered_log.related_entity_id != -summary.id)
                or recovered_log.type != NotificationType.EXAM_RESULT
            ):
                return
            notification_date = recovered_log.notification_date
            if (
                recovered_log.recipient != recipient
                or recovered_log.delivery_score != summary.sum_score
                or (recovered_log.revision_fingerprint is not None and recovered_log.revision_fingerprint != fingerprint)
            ):
                await notification_service.reject_notification(notification_id, revision, "source_changed")
                return

        async def send_func(is_update: bool) -> None:
            prefix: str = "[Обновлено] " if is_update else ""
            text: str = f"{prefix}Результаты за {journal.period_label} по курсу {course.title}: Sum = {summary.sum_score}/{summary.max_period_score}. Посещаемость: {summary.attendance_count}/{summary.total_lessons} дней."

            if document:
                storage_service: StorageService = get_storage_service()
                if document.file_size > 50 * 1024 * 1024:
                    url: str | None = await storage_service.create_private_url(document.file_path)
                    full_text: str = text if url is None else f"{text}\nСсылка на документ: {url}"
                    await bot.send_message(student.parent_telegram_chat_id, full_text)
                else:
                    document_file: InputFile | None = await StreamedStorageInputFile.open(
                        storage_service, document.file_path, document.file_name
                    )
                    if document_file is None:
                        await bot.send_message(student.parent_telegram_chat_id, text)
                    else:
                        await bot.send_document(student.parent_telegram_chat_id, document_file, caption=text)
            else:
                await bot.send_message(student.parent_telegram_chat_id, text)

        if notification_id is not None and revision is not None:
            await notification_service.deliver_notification(notification_id, revision, send_func)
            return

        await notification_service.send_exam_revision(
            recipient, summary.id, journal_id, student_id, summary.sum_score, fingerprint, notification_date, send_func
        )


async def deliver_due_exam_results(ctx) -> int:
    from app.workers.exam_result_delivery import AiogramExamResultPhotoSender, ExamResultDeliveryWorker

    worker: ExamResultDeliveryWorker = ExamResultDeliveryWorker(AsyncSessionLocal, AiogramExamResultPhotoSender(bot))
    return await worker.run_once()


async def send_student_document_notification_task(ctx, student_id: int, journal_id: int) -> None:
    await send_exam_result_notification_task(ctx, student_id, journal_id)


async def archive_expired_courses(ctx: dict[str, Any] | None) -> None:
    async with AsyncSessionLocal() as db:
        today: date = datetime.now(zoneinfo.ZoneInfo(settings.TIMEZONE)).date()
        stmt = (
            update(Course)
            .where(Course.status == CourseStatus.ACTIVE)
            .where(Course.end_date < today)
            .values(status=CourseStatus.ARCHIVED)
        )
        await db.execute(stmt)
        await db.commit()


async def check_payment_reminders(ctx: dict[str, Any] | None) -> None:
    from app.core.redis import enqueue_job
    from app.repositories.sqlalchemy.payment_reminder_repository import SQLAlchemyPaymentReminderRepository
    from app.services.payment_reminder_service import PaymentReminderService

    async def enqueue(job_name: str, payload: dict[str, Any]) -> None:
        await enqueue_job(job_name, **payload)

    db: AsyncSession
    async with AsyncSessionLocal() as db:
        service: PaymentReminderService = PaymentReminderService(SQLAlchemyPaymentReminderRepository(db), enqueue)
        await service.run(datetime.now(zoneinfo.ZoneInfo(settings.TIMEZONE)).date())


async def recover_notification_deliveries(ctx: dict[str, Any] | None) -> int:
    from app.core.redis import enqueue_job

    async def enqueue(job_name: str, payload: dict[str, Any]) -> None:
        await enqueue_job(job_name, **payload)

    db: AsyncSession
    async with AsyncSessionLocal() as db:
        service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))
        return await service.recover_deliveries(enqueue)
