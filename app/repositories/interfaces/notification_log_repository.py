from typing_extensions import Protocol
from app.models.notification_log import NotificationLog
from app.repositories.interfaces.base_repository import BaseRepository


class NotificationLogRepository(BaseRepository[NotificationLog], Protocol):
    pass
