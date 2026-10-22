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
from app.services.sms.sender import ProviderPhoneFormatter


class PasswordSmsDestinationKind(str, Enum):
    STUDENT_PHONE = "student_phone"
    PARENT_PHONE = "parent_phone"


@dataclass(frozen=True)
class PasswordSmsDestination:
    kind: PasswordSmsDestinationKind
    phone: str

    @property
    def masked_phone(self) -> str:
        return f"***{self.phone[-4:]}"


class StudentPasswordSmsDestinationResolver:
    def __init__(self) -> None:
        self._phone_formatter: ProviderPhoneFormatter = ProviderPhoneFormatter()

    def resolve(self, user: User) -> Optional[PasswordSmsDestination]:
        if self._phone_formatter.is_deliverable(user.phone):
            return PasswordSmsDestination(PasswordSmsDestinationKind.STUDENT_PHONE, user.phone)
        if self._phone_formatter.is_deliverable(user.parent_phone):
            return PasswordSmsDestination(PasswordSmsDestinationKind.PARENT_PHONE, user.parent_phone)
        return None

    def resolve_channel(self, user: User, kind: PasswordSmsDestinationKind) -> Optional[PasswordSmsDestination]:
        if kind == PasswordSmsDestinationKind.STUDENT_PHONE and self._phone_formatter.is_deliverable(user.phone):
            return PasswordSmsDestination(kind, user.phone)
        if (
            kind == PasswordSmsDestinationKind.PARENT_PHONE
            and user.role == UserRole.STUDENT
            and self._phone_formatter.is_deliverable(user.parent_phone)
        ):
            return PasswordSmsDestination(kind, user.parent_phone)
        return None

    def reject_undeliverable_contacts(self, phone: Optional[str], parent_phone: Optional[str]) -> None:
        if self._phone_formatter.is_deliverable(phone) or self._phone_formatter.is_deliverable(parent_phone):
            return
        offending_field: str = "phone" if phone else "parent_phone"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{
                "loc": ["body", offending_field],
                "msg": "Password SMS needs a phone with 8 to 15 digits; provide a deliverable phone or parent phone",
                "type": "value_error",
            }],
        )


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

    def resolve_channel_destination(
        self, user: User, kind: PasswordSmsDestinationKind
    ) -> Optional[PasswordSmsDestination]:
        return self._destination_resolver.resolve_channel(user, kind)

    def require_destination(
        self, user: User, kind: Optional[PasswordSmsDestinationKind] = None
    ) -> PasswordSmsDestination:
        destination: Optional[PasswordSmsDestination] = (
            self.resolve_destination(user) if kind is None else self.resolve_channel_destination(user, kind)
        )
        if destination is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The account has no deliverable phone for this channel",
            )
        return destination

    async def issue_password(
        self,
        user: User,
        reason: PasswordSmsReason,
        actor_id: Optional[int],
        enforce_rate_limits: bool,
        channel: Optional[PasswordSmsDestinationKind] = None,
    ) -> PasswordSmsDestination:
        destination: PasswordSmsDestination = self.require_destination(user, channel)
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
