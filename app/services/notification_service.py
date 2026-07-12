from datetime import date, datetime, timezone
from typing import Callable, Awaitable, Optional
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from arq import Retry
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = SQLAlchemyNotificationLogRepository(db)

    async def send_notification_with_idempotency(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        send_func: Callable[[bool], Awaitable[None]],
        check_revision_func: Optional[Callable[[], Awaitable[bool]]] = None,
        score_val: Optional[int] = None
    ) -> bool:
        query = select(NotificationLog).filter(
            NotificationLog.recipient == recipient,
            NotificationLog.type == notification_type,
            NotificationLog.related_entity_id == related_entity_id,
            NotificationLog.notification_date == notification_date
        )
        result = await self.db.execute(query)
        log = result.scalars().first()

        is_update = False
        if log:
            if log.status == NotificationStatus.SENT:
                if check_revision_func:
                    is_revised = await check_revision_func()
                    if not is_revised:
                        return False
                    is_update = True
                else:
                    return False
            elif log.attempts >= 3:
                return False

            log.attempts += 1
            await self.db.commit()
        else:
            log = NotificationLog(
                recipient=recipient,
                type=notification_type,
                related_entity_id=related_entity_id,
                notification_date=notification_date,
                status=NotificationStatus.FAILED,
                attempts=1
            )
            self.db.add(log)
            try:
                await self.db.commit()
            except IntegrityError:
                await self.db.rollback()
                return False

        try:
            await send_func(is_update)
            log.status = NotificationStatus.SENT
            log.sent_at = datetime.now(timezone.utc)
            if score_val is not None:
                log.error_message = f"score:{score_val}"
            else:
                log.error_message = None
            await self.db.commit()
            return True
        except Exception as e:
            log.status = NotificationStatus.FAILED
            log.error_message = str(e)
            await self.db.commit()
            if log.attempts < 3:
                raise Retry(defer=5 * log.attempts)
            return False
