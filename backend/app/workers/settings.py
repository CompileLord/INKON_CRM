from arq import cron
from app.core.config import settings
from app.core.redis import RedisConnectionConfiguration
from arq.connections import RedisSettings
from app.workers.tasks import (
    send_verification_email_task,
    send_telegram_message,
    send_exam_result_notification_task,
    send_student_document_notification_task,
    archive_expired_courses,
    check_payment_reminders,
    send_email
)


class WorkerSettings:
    redis_settings: RedisSettings = RedisConnectionConfiguration.from_url(
        settings.REDIS_URL
    ).create_arq_settings()
    functions = [
        send_verification_email_task,
        send_telegram_message,
        send_exam_result_notification_task,
        send_student_document_notification_task,
        send_email
    ]
    cron_jobs = [
        cron(archive_expired_courses, hour=20, minute=0),
        cron(check_payment_reminders, hour=4, minute=0)
    ]
