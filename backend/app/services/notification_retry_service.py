from typing import Any, Awaitable, Callable, Protocol

from fastapi import HTTPException

from app.models.notification_log import NotificationLog
from app.repositories.interfaces.notification_log_repository import NotificationLogRepository


class NotificationRetryAudit(Protocol):
    async def log(self, user_id: int | None, action: str, entity_type: str, entity_id: int, changes: dict[str, Any]) -> None: ...


class NotificationRetryService:
    def __init__(self, repository: NotificationLogRepository, audit: NotificationRetryAudit, enqueue: Callable[..., Awaitable[Any]]) -> None:
        self._repository: NotificationLogRepository = repository
        self._audit: NotificationRetryAudit = audit
        self._enqueue: Callable[..., Awaitable[Any]] = enqueue

    async def retry(self, notification_id: int, actor_id: int) -> dict[str, Any]:
        if notification_id < 0:
            if not await self._repository.debt_sms_exists(-notification_id):
                raise HTTPException(status_code=404, detail={"code": "notification_not_found"})
            raise HTTPException(status_code=409, detail={"code": "debt_reminder_sms_retry_unavailable"})
        log: NotificationLog | None = await self._repository.request_retry(notification_id)
        if log is None:
            existing: NotificationLog | None = await self._repository.get_by_id(notification_id)
            if existing is None:
                raise HTTPException(status_code=404, detail={"code": "notification_not_found"})
            raise HTTPException(status_code=409, detail={"code": "notification_not_failed"})
        await self._audit.log(actor_id, "update", "notification", notification_id, {"retry": ("failed", "queued")})
        item: dict[str, Any] | None = await self._repository.delivery_item(notification_id)
        revision: int = log.revision or 1
        await self._repository.commit()
        await self._enqueue("retry_notification_delivery", notification_id=notification_id, revision=revision,
                            _job_id=f"notification:{notification_id}:{revision}:retry")
        if item is None:
            raise RuntimeError("Retry notification disappeared")
        return item
