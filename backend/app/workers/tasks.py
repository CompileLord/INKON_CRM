from datetime import date, datetime, timezone, timedelta
import zoneinfo
import logging
from sqlalchemy import select, update, func, cast, Numeric
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


async def send_telegram_message(ctx, chat_id: int, text: str) -> None:
    try:
        await bot.send_message(chat_id, text)
    except (TelegramForbiddenError, TelegramBadRequest) as e:
        logger.error(f"Telegram send failed to {chat_id}: {e}")


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


async def send_exam_result_notification_task(ctx, student_id: int, journal_id: int) -> None:
    async with AsyncSessionLocal() as db:
        stmt = (
            select(JournalStudentSummary)
            .options(
                joinedload(JournalStudentSummary.student),
                joinedload(JournalStudentSummary.journal).joinedload(Journal.course)
            )
            .filter(
                JournalStudentSummary.student_id == student_id,
                JournalStudentSummary.journal_id == journal_id
            )
        )
        res = await db.execute(stmt)
        summary = res.scalars().first()
        if not summary:
            return

        student = summary.student
        if not student.parent_telegram_chat_id:
            logger.warning(f"Parent telegram chat ID not set for student {student.id}")
            return

        journal = summary.journal
        course = journal.course

        doc_stmt = select(Document).filter(
            Document.owner_type == DocumentOwnerType.STUDENT,
            Document.owner_id == student_id,
            Document.journal_id == journal_id,
            Document.is_deleted == False
        )
        doc_res = await db.execute(doc_stmt)
        document = doc_res.scalars().first()

        notification_service = NotificationService(db)
        recipient = str(student.parent_telegram_chat_id)
        notification_date = date.today()

        async def check_revision_func() -> bool:
            log_stmt = select(NotificationLog).filter(
                NotificationLog.recipient == recipient,
                NotificationLog.type == NotificationType.EXAM_RESULT,
                NotificationLog.related_entity_id == journal_id,
                NotificationLog.notification_date == notification_date
            )
            log_res = await db.execute(log_stmt)
            existing_log = log_res.scalars().first()
            if existing_log and existing_log.error_message != f"score:{summary.sum_score}":
                return True
            return False

        async def send_func(is_update: bool) -> None:
            prefix = "[Обновлено] " if is_update else ""
            text = f"{prefix}Результаты за {journal.period_label} по курсу {course.title}: Sum = {summary.sum_score}/{summary.max_period_score}. Посещаемость: {summary.attendance_count}/{summary.total_lessons} дней."

            
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

        await notification_service.send_notification_with_idempotency(
            recipient=recipient,
            notification_type=NotificationType.EXAM_RESULT,
            related_entity_id=journal_id,
            notification_date=notification_date,
            send_func=send_func,
            check_revision_func=check_revision_func,
            score_val=summary.sum_score,
            user_id=student.id
        )


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


async def check_payment_reminders(ctx) -> None:
    async with AsyncSessionLocal() as db:
        students_stmt = select(User).filter(
            User.role == UserRole.STUDENT,
            User.parent_telegram_chat_id.isnot(None),
            User.payment_day_of_month.isnot(None),
            User.is_deleted == False
        )
        students_res = await db.execute(students_stmt)
        students = students_res.scalars().all()

        tz = zoneinfo.ZoneInfo(settings.TIMEZONE)
        now_in_tz = datetime.now(tz)
        today_date = now_in_tz.date()

        for student in students:
            try:
                payment_day = student.payment_day_of_month
                due_this_month = date(today_date.year, today_date.month, payment_day)

                if today_date.month == 12:
                    due_next_month = date(today_date.year + 1, 1, payment_day)
                else:
                    due_next_month = date(today_date.year, today_date.month + 1, payment_day)

                if today_date.month == 1:
                    due_prev_month = date(today_date.year - 1, 12, payment_day)
                else:
                    due_prev_month = date(today_date.year, today_date.month - 1, payment_day)

                if due_this_month >= today_date:
                    next_due_date = due_this_month
                    prev_due_date = due_prev_month
                else:
                    next_due_date = due_next_month
                    prev_due_date = due_this_month

                diff_days = (next_due_date - today_date).days
                if diff_days not in (1, 2):
                    continue

                enroll_stmt = select(Enrollment).options(
                    joinedload(Enrollment.course)
                ).filter(
                    Enrollment.student_id == student.id,
                    Enrollment.status == EnrollmentStatus.ACTIVE,
                    Enrollment.is_deleted == False
                )
                enroll_res = await db.execute(enroll_stmt)
                enrollments = enroll_res.scalars().all()

                start_dt = datetime.combine(prev_due_date, datetime.min.time()).replace(tzinfo=tz)
                end_dt = datetime.combine(next_due_date, datetime.max.time()).replace(tzinfo=tz)

                for enroll in enrollments:
                    pay_stmt = select(
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
                    pay_res = await db.execute(pay_stmt)
                    total_paid = pay_res.scalar() or Decimal("0.0")

                    if total_paid < enroll.price_at_enrollment:
                        recipient = str(student.parent_telegram_chat_id)
                        notif_type = (
                            NotificationType.PAYMENT_REMINDER_2D
                            if diff_days == 2
                            else NotificationType.PAYMENT_REMINDER_1D
                        )
                        
                        notification_service = NotificationService(db)

                        async def send_func(is_update: bool) -> None:
                            due_date_str = next_due_date.strftime("%Y-%m-%d")
                            if diff_days == 2:
                                text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 2 дня (дата: {due_date_str})"
                            else:
                                text = f"Напоминание: оплата за курс {enroll.course.title} для {student.first_name} {student.last_name} через 1 день (дата: {due_date_str})"
                            
                            from app.core.redis import enqueue_job
                            await enqueue_job("send_telegram_message", chat_id=student.parent_telegram_chat_id, text=text)

                        await notification_service.send_notification_with_idempotency(
                            recipient=recipient,
                            notification_type=notif_type,
                            related_entity_id=enroll.id,
                            notification_date=today_date,
                            send_func=send_func,
                            user_id=student.id
                        )
            except Exception as e:
                logger.error(f"Error checking reminders for student {student.id}: {e}")
