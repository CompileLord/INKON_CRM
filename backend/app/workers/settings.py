import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from datetime import timezone as datetime_timezone
from typing import Any

from arq import Retry, cron, func
from arq.connections import ArqRedis, RedisSettings
from redis.asyncio.lock import Lock

from app.core import redis as redis_module
from app.core.config import settings
from app.core.redis import RedisConnectionConfiguration
from app.schemas.maintenance import MaintenanceTaskName
from app.workers.debt_reminder_delivery import deliver_due_debt_reminders
from app.workers.token_retention import purge_expired_refresh_tokens
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


class MaintenanceScheduler:
    enqueue_timeout_seconds: float = 3.0
    schedule_hours: dict[MaintenanceTaskName, int] = {
        "archive_expired_courses": 20,
        "check_payment_reminders": 4,
    }

    @staticmethod
    def now() -> datetime:
        return datetime.now(datetime_timezone.utc)

    @classmethod
    async def enqueue(cls, task: MaintenanceTaskName, pool: ArqRedis | None = None) -> str:
        current: datetime = cls.now().astimezone(datetime_timezone.utc)
        window: datetime = current - timedelta(hours=cls.schedule_hours[task])
        job_id: str = f"maintenance:{task}:{window.date().isoformat()}"
        async with asyncio.timeout(cls.enqueue_timeout_seconds):
            producer: ArqRedis = pool if pool is not None else await redis_module.get_arq_pool()
            await producer.enqueue_job(task, _job_id=job_id, _expires=172800)
        return job_id

    @classmethod
    async def schedule_archive_courses(cls, ctx: dict[str, Any]) -> None:
        await cls.enqueue("archive_expired_courses", ctx["redis"])

    @classmethod
    async def schedule_payment_reminders(cls, ctx: dict[str, Any]) -> None:
        await cls.enqueue("check_payment_reminders", ctx["redis"])


class MaintenanceWorker:
    @classmethod
    async def run(cls, ctx: dict[str, Any], task: MaintenanceTaskName) -> None:
        pool: ArqRedis = ctx["redis"]
        lock: Lock = pool.lock(f"maintenance:lock:{task}", timeout=660, blocking=False)
        if not await lock.acquire():
            raise Retry(defer=60)
        try:
            operation: Callable[[dict[str, Any]], Awaitable[None]] = {
                "archive_expired_courses": archive_expired_courses,
                "check_payment_reminders": check_payment_reminders,
            }[task]
            async with asyncio.timeout(600):
                await operation(ctx)
        finally:
            await lock.release()

    @classmethod
    async def archive_courses(cls, ctx: dict[str, Any]) -> None:
        await cls.run(ctx, "archive_expired_courses")

    @classmethod
    async def payment_reminders(cls, ctx: dict[str, Any]) -> None:
        await cls.run(ctx, "check_payment_reminders")


class WorkerSettings:
    timezone: datetime_timezone = datetime_timezone.utc
    redis_settings: RedisSettings = RedisConnectionConfiguration.from_url(
        settings.REDIS_URL
    ).create_arq_settings()
    functions: list[Any] = [
        func(
            MaintenanceWorker.archive_courses, name="archive_expired_courses",
            keep_result=172800, timeout=600, max_tries=3,
        ),
        func(
            MaintenanceWorker.payment_reminders, name="check_payment_reminders",
            keep_result=172800, timeout=600, max_tries=3,
        ),
        send_verification_email_task,
        func(send_telegram_message, keep_result=0),
        func(send_exam_result_notification_task, keep_result=0),
        send_student_document_notification_task,
        deliver_due_exam_results,
        deliver_due_debt_reminders,
        recover_notification_deliveries,
        send_email,
        func(purge_expired_refresh_tokens, keep_result=0)
    ]
    cron_jobs: list[Any] = [
        cron(MaintenanceScheduler.schedule_archive_courses, hour=20, minute=0, timeout=5, max_tries=3),
        cron(MaintenanceScheduler.schedule_payment_reminders, hour=4, minute=0, timeout=5, max_tries=3),
        cron(recover_notification_deliveries, second={15, 45}, run_at_startup=False),
        cron(deliver_due_exam_results, second={0, 30}, run_at_startup=False),
        cron(deliver_due_debt_reminders, second={10, 40}, run_at_startup=False),
        cron(purge_expired_refresh_tokens, minute=25, run_at_startup=False, keep_result=0)
    ]
    on_startup = outbox_worker_startup
    on_shutdown = outbox_worker_shutdown
