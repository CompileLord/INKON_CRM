from typing import Any

from sqlalchemy import func, update
from sqlalchemy.engine import Result

from app.models.notification_log import NotificationLog, NotificationStatus
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository


class SQLAlchemyNotificationRetryRepository(SQLAlchemyNotificationLogRepository):
    async def delivery_item(self, notification_id: int) -> dict[str, Any] | None:
        items: list[dict[str, Any]]
        total: int
        items, total = await self.delivery_page(1, 1, None, notification_id)
        return items[0] if total else None

    async def request_retry(self, notification_id: int) -> NotificationLog | None:
        result: Result[tuple[NotificationLog]] = await self._session.execute(
            update(NotificationLog).where(
                NotificationLog.id == notification_id,
                func.coalesce(NotificationLog.delivery_state, NotificationLog.status) == NotificationStatus.FAILED,
            ).values(
                status=NotificationStatus.QUEUED, delivery_state=NotificationStatus.QUEUED,
                attempts=0, is_terminal=False, claim_token=None, lease_expires_at=None,
                error_message=None, retry_requested=True, revision=func.coalesce(NotificationLog.revision, 1) + 1,
            ).returning(NotificationLog).execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

