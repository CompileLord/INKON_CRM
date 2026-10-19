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
from app.services.notification_service import NotificationService
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
        )
        doc_res: Result[tuple[Document]] = await db.execute(doc_stmt)
        document: Document | None = doc_res.scalars().first()

        notification_service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))
        recipient: str = str(student.parent_telegram_chat_id)
        notification_date: date = date.today()
        if notification_id is not None:
            recovered_log: NotificationLog | None = await notification_service.repo.get_by_id(notification_id)
            if recovered_log is None or (recovered_log.revision or 1) != revision:
                return
            if (
                recovered_log.user_id != student_id
                or recovered_log.related_entity_id != journal_id
                or recovered_log.type != NotificationType.EXAM_RESULT
            ):
                return
            notification_date = recovered_log.notification_date
            if recovered_log.recipient != recipient or recovered_log.delivery_score != summary.sum_score:
                await notification_service.reject_notification(notification_id, revision, "source_changed")
                return

        async def check_revision_func() -> bool:
            log_stmt: Select[tuple[NotificationLog]] = select(NotificationLog).filter(
                NotificationLog.recipient == recipient,
                NotificationLog.type == NotificationType.EXAM_RESULT,
                NotificationLog.related_entity_id == journal_id,
                NotificationLog.notification_date == notification_date,
            )
            log_res: Result[tuple[NotificationLog]] = await db.execute(log_stmt)
            existing_log: NotificationLog | None = log_res.scalars().first()
            if existing_log and existing_log.error_message != f"score:{summary.sum_score}":
                return True
            return False

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

        await notification_service.send_notification_with_idempotency(
            recipient=recipient,
            notification_type=NotificationType.EXAM_RESULT,
            related_entity_id=journal_id,
            notification_date=notification_date,
            send_func=send_func,
            check_revision_func=check_revision_func,
            score_val=summary.sum_score,
            user_id=student.id,
        )


async def deliver_due_exam_results(ctx) -> int:
    from app.workers.exam_result_delivery import AiogramExamResultPhotoSender, ExamResultDeliveryWorker

    worker: ExamResultDeliveryWorker = ExamResultDeliveryWorker(AsyncSessionLocal, AiogramExamResultPhotoSender(bot))
    return await worker.run_once()


async def send_student_document_notification_task(ctx, student_id: int, journal_id: int) -> None:
    await send_exam_result_notification_task(ctx, student_id, journal_id)


async def archive_expired_courses(ctx) -> None:
    async with AsyncSessionLocal() as db:
        today = date.today()
        stmt = (
            update(Course)
            .where(Course.status == CourseStatus.ACTIVE)
            .where(Course.end_date < today)
            .values(status=CourseStatus.ARCHIVED)
        )
        await db.execute(stmt)
        await db.commit()


async def check_payment_reminders(ctx: dict[str, Any] | None) -> None:
    db: AsyncSession
    async with AsyncSessionLocal() as db:
        students_stmt: Select[tuple[User]] = select(User).filter(
            User.role == UserRole.STUDENT,
            User.parent_telegram_chat_id.isnot(None),
            User.payment_day_of_month.isnot(None),
            User.is_deleted == False
        )
        students_res: Result[tuple[User]] = await db.execute(students_stmt)
        students: Sequence[User] = students_res.scalars().all()

        tz: zoneinfo.ZoneInfo = zoneinfo.ZoneInfo(settings.TIMEZONE)
        now_in_tz: datetime = datetime.now(tz)
        today_date: date = now_in_tz.date()

        student: User
        for student in students:
            try:
                payment_day: int | None = student.payment_day_of_month
                due_this_month: date = date(today_date.year, today_date.month, payment_day)

                if today_date.month == 12:
                    due_next_month: date = date(today_date.year + 1, 1, payment_day)
                else:
                    due_next_month = date(today_date.year, today_date.month + 1, payment_day)

                if today_date.month == 1:
                    due_prev_month: date = date(today_date.year - 1, 12, payment_day)
                else:
                    due_prev_month = date(today_date.year, today_date.month - 1, payment_day)

                if due_this_month >= today_date:
                    next_due_date: date = due_this_month
                    prev_due_date: date = due_prev_month
                else:
                    next_due_date = due_next_month
                    prev_due_date = due_this_month

                diff_days: int = (next_due_date - today_date).days
                if diff_days not in (1, 2):
                    continue

                enroll_stmt: Select[tuple[Enrollment]] = select(Enrollment).options(
                    joinedload(Enrollment.course)
                ).filter(
                    Enrollment.student_id == student.id,
                    Enrollment.status == EnrollmentStatus.ACTIVE,
                    Enrollment.is_deleted == False
                )
                enroll_res: Result[tuple[Enrollment]] = await db.execute(enroll_stmt)
                enrollments: Sequence[Enrollment] = enroll_res.scalars().all()

                start_dt: datetime = datetime.combine(prev_due_date, datetime.min.time()).replace(tzinfo=tz)
                end_dt: datetime = datetime.combine(next_due_date, datetime.max.time()).replace(tzinfo=tz)

                enroll: Enrollment
                for enroll in enrollments:
                    pay_stmt: Select[tuple[Decimal]] = select(
                        func.coalesce(
                            func.sum(
                                Payment.amount * (Decimal("1.0") - cast(Payment.discount_percent, Numeric) / Decimal("100.0"))
                            ),
                            Decimal("0.0")
                        )
                    ).filter(
                        Payment.student_id == student.id,
                        Payment.course_id == enroll.course_id,
                        Payment.paid_at >= start_dt,
                        Payment.paid_at <= end_dt
                    )
                    pay_res: Result[tuple[Decimal]] = await db.execute(pay_stmt)
                    total_paid: Decimal = pay_res.scalar() or Decimal("0.0")

                    if total_paid < enroll.price_at_enrollment:
                        recipient: str = str(student.parent_telegram_chat_id)
                        notif_type: NotificationType = (
                            NotificationType.PAYMENT_REMINDER_2D
                            if diff_days == 2
                            else NotificationType.PAYMENT_REMINDER_1D
                        )
                        
                        notification_service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))

                        due_date_str: str = next_due_date.strftime("%Y-%m-%d")
                        if diff_days == 2:
                            text: str = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 2 дня (дата: {due_date_str})"
                        else:
                            text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 1 день (дата: {due_date_str})"

                        async def enqueue_notification(notification_id: int, revision: int) -> None:
                            from app.core.redis import enqueue_job
                            await enqueue_job("send_telegram_message", chat_id=student.parent_telegram_chat_id, text=text, notification_id=notification_id, revision=revision, _job_id=f"notification:{notification_id}:{revision}:initial")

                        await notification_service.queue_notification(
                            recipient=recipient,
                            notification_type=notif_type,
                            related_entity_id=enroll.id,
                            notification_date=today_date,
                            enqueue_func=enqueue_notification,
                            delivery_text=text,
                            revision_requested=False,
                            user_id=student.id
                        )
            except Exception as e:
                logger.error(f"Error checking reminders for student {student.id}: {e}")


async def recover_notification_deliveries(ctx: dict[str, Any] | None) -> int:
    from app.core.redis import enqueue_job

    async def enqueue(job_name: str, payload: dict[str, Any]) -> None:
        await enqueue_job(job_name, **payload)

    db: AsyncSession
    async with AsyncSessionLocal() as db:
        service: NotificationService = NotificationService(SQLAlchemyNotificationLogRepository(db))
        return await service.recover_deliveries(enqueue)
