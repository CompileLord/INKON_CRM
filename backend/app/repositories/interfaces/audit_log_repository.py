from typing_extensions import Protocol
from app.models.audit_log import AuditLog
from app.repositories.interfaces.base_repository import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog], Protocol):
    pass
