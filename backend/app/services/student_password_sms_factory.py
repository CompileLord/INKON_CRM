from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.services.audit_service import AuditService
from app.services.outbox_service import OutboxService
from app.services.student_password_sms_service import StudentPasswordSmsService


class StudentPasswordSmsServiceFactory:
    @staticmethod
    def create(session: AsyncSession) -> StudentPasswordSmsService:
        return StudentPasswordSmsService(
            user_repository=SQLAlchemyUserRepository(session),
            outbox_service=OutboxService(SQLAlchemyOutboxRepository(session), settings.JWT_SECRET_KEY),
            audit_service=AuditService(session),
        )
