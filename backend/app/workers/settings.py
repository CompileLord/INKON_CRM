from typing import Any
from datetime import timezone as datetime_timezone
from collections.abc import Awaitable, Callable
from arq import cron, func
from arq.connections import RedisSettings
from app.core.config import settings
from app.core.redis import RedisConnectionConfiguration
from app.workers.debt_reminder_delivery import deliver_due_debt_reminders
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

    from app.workers.storage_cleanup import StorageCleanupWorker

    manager: OutboxWorkerManager = OutboxWorkerManager(
        database_url=settings.DATABASE_URL,
        payload_master_key=settings.JWT_SECRET_KEY,
    )
    ctx["outbox_worker"] = manager
    try:
        await manager.start()
        cleanup: StorageCleanupWorker = StorageCleanupWorker()
        ctx["storage_cleanup"] = cleanup
        await cleanup.start()
    except BaseException:
        try:
            await outbox_worker_shutdown(ctx)
        except BaseException:
            pass
        raise


async def outbox_worker_shutdown(ctx: dict[str, Any]) -> None:
    from app.core.resource_lifecycle import ProcessResources, ResourceCleanup

    cleanup: Any = ctx.pop("storage_cleanup", None)
    manager: Any = ctx.pop("outbox_worker", None)
    closers: list[Callable[[], Awaitable[None]]] = []
    if cleanup is not None:
        closers.append(cleanup.stop)
    if manager is not None:
        closers.append(manager.stop)
    closers.append(ProcessResources.close)
    await ResourceCleanup.close_all(closers)


class WorkerSettings:
    timezone: datetime_timezone = datetime_timezone.utc
    redis_settings: RedisSettings = RedisConnectionConfiguration.from_url(
        settings.REDIS_URL
    ).create_arq_settings()
    functions = [
        send_verification_email_task,
        func(send_telegram_message, keep_result=0),
        func(send_exam_result_notification_task, keep_result=0),
        send_student_document_notification_task,
        deliver_due_exam_results,
        deliver_due_debt_reminders,
        recover_notification_deliveries,
        send_email
    ]
    cron_jobs = [
        cron(archive_expired_courses, hour=20, minute=0),
        cron(check_payment_reminders, hour=4, minute=0),
        cron(recover_notification_deliveries, second={15, 45}, run_at_startup=False),
        cron(deliver_due_exam_results, second={0, 30}, run_at_startup=False),
        cron(deliver_due_debt_reminders, second={10, 40}, run_at_startup=False)
    ]
    on_startup = outbox_worker_startup
    on_shutdown = outbox_worker_shutdown
