from datetime import date, datetime, timezone
from typing import Callable, Awaitable, Optional
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from arq import Retry
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from app.repositories.sqlalchemy.notification_log_repository import SQLAlchemyNotificationLogRepository


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.repo = SQLAlchemyNotificationLogRepository(db)

    async def get_user_notifications(self, user_id: int, page: int = 1, page_size: int = 20) -> dict:
        total_stmt = select(func.count()).select_from(NotificationLog).filter(NotificationLog.user_id == user_id)
        total_res = await self.db.execute(total_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = (
            select(NotificationLog)
            .filter(NotificationLog.user_id == user_id)
            .order_by(NotificationLog.notification_date.desc(), NotificationLog.id.desc())
            .offset(offset)
            .limit(page_size)
        )
        res = await self.db.execute(stmt)
        items = list(res.scalars().all())

        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    async def get_unread_count(self, user_id: int) -> int:
        stmt = select(func.count()).select_from(NotificationLog).filter(
            NotificationLog.user_id == user_id,
            NotificationLog.read_at.is_(None)
        )
        res = await self.db.execute(stmt)
        return res.scalar() or 0

    async def mark_as_read(self, notification_id: int, user_id: int) -> NotificationLog:
        stmt = select(NotificationLog).filter(NotificationLog.id == notification_id)
        res = await self.db.execute(stmt)
        log = res.scalars().first()
        if not log:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
        if log.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        if log.read_at is None:
            log.read_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(log)
        return log

    async def send_notification_with_idempotency(
        self,
        recipient: str,
        notification_type: NotificationType,
        related_entity_id: int,
        notification_date: date,
        send_func: Callable[[bool], Awaitable[None]],
        check_revision_func: Optional[Callable[[], Awaitable[bool]]] = None,
        score_val: Optional[int] = None,
        user_id: Optional[int] = None
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
            if user_id is not None and log.user_id is None:
                log.user_id = user_id
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
                user_id=user_id,
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
