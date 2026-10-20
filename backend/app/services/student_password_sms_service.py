from dataclasses import dataclass
from enum import Enum
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sms_rate_limiter import PasswordSmsRateLimiter
from app.core.security import PasswordWorkService
from app.core.student_passwords import StudentPasswordCodeGenerator
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.core.config import settings
from app.services.audit_service import AuditService
from app.services.outbox_service import OutboxService
from app.services.sms.messages import PasswordSmsReason


class PasswordSmsDestinationKind(str, Enum):
    STUDENT_PHONE = "student_phone"
    PARENT_PHONE = "parent_phone"


@dataclass(frozen=True)
class PasswordSmsDestination:
    kind: PasswordSmsDestinationKind
    phone: str


class StudentPasswordSmsDestinationResolver:
    def resolve(self, user: User) -> Optional[PasswordSmsDestination]:
        if user.phone:
            return PasswordSmsDestination(PasswordSmsDestinationKind.STUDENT_PHONE, user.phone)
        if user.parent_phone:
            return PasswordSmsDestination(PasswordSmsDestinationKind.PARENT_PHONE, user.parent_phone)
        return None


class StudentPasswordSmsService:
    def __init__(
        self,
        db: AsyncSession,
        limiter: Optional[PasswordSmsRateLimiter] = None,
        code_generator: Optional[StudentPasswordCodeGenerator] = None,
    ) -> None:
        self._db: AsyncSession = db
        self._limiter: PasswordSmsRateLimiter = limiter or PasswordSmsRateLimiter()
        self._code_generator: StudentPasswordCodeGenerator = code_generator or StudentPasswordCodeGenerator()
        self._destination_resolver: StudentPasswordSmsDestinationResolver = StudentPasswordSmsDestinationResolver()
        self._password_work_service: PasswordWorkService = PasswordWorkService()
        self._user_repository: SQLAlchemyUserRepository = SQLAlchemyUserRepository(db)
        self._token_repository: SQLAlchemyRefreshTokenRepository = SQLAlchemyRefreshTokenRepository(db)
        self._outbox_service: OutboxService = OutboxService(SQLAlchemyOutboxRepository(db), settings.JWT_SECRET_KEY)
        self._audit_service: AuditService = AuditService(db)

    def resolve_destination(self, user: User) -> Optional[PasswordSmsDestination]:
        if user.role != UserRole.STUDENT:
            return None
        return self._destination_resolver.resolve(user)

    def require_destination(self, user: User) -> PasswordSmsDestination:
        destination: Optional[PasswordSmsDestination] = self.resolve_destination(user)
        if destination is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Student needs a phone or parent phone to receive the password SMS",
            )
        return destination

    async def issue_password(
        self,
        user: User,
        reason: PasswordSmsReason,
        actor_id: Optional[int],
        enforce_rate_limits: bool,
    ) -> PasswordSmsDestination:
        destination: PasswordSmsDestination = self.require_destination(user)
        if enforce_rate_limits:
            await self._limiter.consume_budgets(user.id, destination.phone)
        code: str = self._code_generator.generate()
        user.password_hash = await self._password_work_service.hash(code)
        user.must_set_password = True
        user.auth_version += 1
        await self._user_repository.update(user)
        await self._token_repository.revoke_all_for_user(user.id)
        await self._outbox_service.enqueue_student_password_sms(
            recipient_phone=destination.phone,
            target_user_id=user.id,
            code=code,
            reason=reason.value,
            language=None,
        )
        await self._audit_service.log(
            actor_id,
            "update",
            "user",
            user.id,
            {"password_sms_queued": (None, f"{reason.value}:{destination.kind.value}")},
        )
        return destination
