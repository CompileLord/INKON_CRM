from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.repositories.interfaces.audit_log_repository import AuditLogRepository
from app.repositories.sqlalchemy.base_repository import SQLAlchemyBaseRepository


class SQLAlchemyAuditLogRepository(SQLAlchemyBaseRepository[AuditLog], AuditLogRepository):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(AuditLog, session)
