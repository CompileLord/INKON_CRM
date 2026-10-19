from typing import Any
from arq import cron, func
from arq.connections import RedisSettings
from app.core.config import settings
from app.core.redis import RedisConnectionConfiguration
from app.workers.tasks import (
    send_verification_email_task,
    send_telegram_message,
    send_exam_result_notification_task,
    send_student_document_notification_task,
    archive_expired_courses,
    check_payment_reminders,
    deliver_due_exam_results,
    recover_notification_deliveries,
    send_email
)


async def outbox_worker_startup(ctx: dict[str, Any]) -> None:
    from app.workers.outbox import OutboxWorkerManager

    manager = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=settings.JWT_SECRET_KEY,
    )
    await manager.start()
    ctx["outbox_worker"] = manager
    from app.workers.storage_cleanup import StorageCleanupWorker
    cleanup: StorageCleanupWorker = StorageCleanupWorker()
    await cleanup.start()
    ctx["storage_cleanup"] = cleanup


async def outbox_worker_shutdown(ctx: dict[str, Any]) -> None:
    cleanup: Any = ctx.get("storage_cleanup")
    try:
        if cleanup is not None:
            await cleanup.stop()
    finally:
        manager: Any = ctx.get("outbox_worker")
        try:
            if manager is not None:
                await manager.stop()
        finally:
            from app.core.redis import close_arq_pool
            await close_arq_pool()


class WorkerSettings:
    redis_settings: RedisSettings = RedisConnectionConfiguration.from_url(
        settings.REDIS_URL
    ).create_arq_settings()
    functions = [
        send_verification_email_task,
        func(send_telegram_message, keep_result=0),
        func(send_exam_result_notification_task, keep_result=0),
        send_student_document_notification_task,
        deliver_due_exam_results,
        recover_notification_deliveries,
        send_email
    ]
    cron_jobs = [
        cron(archive_expired_courses, hour=20, minute=0),
        cron(check_payment_reminders, hour=4, minute=0),
        cron(recover_notification_deliveries, second={15, 45}, run_at_startup=False),
        cron(deliver_due_exam_results, second={0, 30}, run_at_startup=False)
    ]
    on_startup = outbox_worker_startup
    on_shutdown = outbox_worker_shutdown
