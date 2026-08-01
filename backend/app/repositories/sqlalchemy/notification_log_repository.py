from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification_log import NotificationLog
from app.repositories.interfaces.notification_log_repository import NotificationLogRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyNotificationLogRepository(SQLAlchemyBaseRepository[NotificationLog], NotificationLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(NotificationLog, session)
