from dataclasses import dataclass
from enum import Enum
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Protocol

from fastapi import HTTPException, status

from app.core.sms_rate_limiter import PasswordSmsRateLimiter
from app.core.security import PasswordWorkService
from app.core.student_passwords import PendingStudentPasswordHasher, StudentPasswordCodeGenerator
from app.models.user import User, UserRole
from app.repositories.interfaces.user_repository import UserRepository
from app.core.config import settings
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


class PasswordSmsAudit(Protocol):
    async def log(
        self, user_id: Optional[int], action: str, entity_type: str, entity_id: int,
        changes: dict[str, Any],
    ) -> None: ...


class StudentPasswordSmsService:
    def __init__(
        self,
        user_repository: UserRepository,
        outbox_service: OutboxService,
        audit_service: PasswordSmsAudit,
        limiter: Optional[PasswordSmsRateLimiter] = None,
        code_generator: Optional[StudentPasswordCodeGenerator] = None,
    ) -> None:
        self._limiter: PasswordSmsRateLimiter = limiter or PasswordSmsRateLimiter()
        self._code_generator: StudentPasswordCodeGenerator = code_generator or StudentPasswordCodeGenerator()
        self._destination_resolver: StudentPasswordSmsDestinationResolver = StudentPasswordSmsDestinationResolver()
        self._password_work_service: PasswordWorkService = PasswordWorkService()
        self._pending_password_hasher: PendingStudentPasswordHasher = PendingStudentPasswordHasher(settings.JWT_SECRET_KEY)
        self._user_repository: UserRepository = user_repository
        self._outbox_service: OutboxService = outbox_service
        self._audit_service: PasswordSmsAudit = audit_service

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
        await self._limiter.consume_budgets(user.id, destination.phone, enforce_cooldown=enforce_rate_limits)
        code: str = self._code_generator.generate()
        if reason == PasswordSmsReason.INITIAL:
            user.password_hash = await self._password_work_service.hash(code)
            user.must_set_password = False
        else:
            user.pending_password_hash = self._pending_password_hasher.hash(user.id, code)
            user.pending_password_expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SMS_PASSWORD_PENDING_TTL_SECONDS)
        await self._user_repository.update(user)
        await self._outbox_service.enqueue_student_password_sms(
            recipient_phone=destination.phone,
            target_user_id=user.id,
            code=code,
            reason=reason.value,
            language=None,
            expires_at=user.pending_password_expires_at if reason == PasswordSmsReason.RESET else None,
        )
        await self._audit_service.log(
            actor_id,
            "update",
            "user",
            user.id,
            {"password_sms_queued": (None, f"{reason.value}:{destination.kind.value}")},
        )
        return destination
