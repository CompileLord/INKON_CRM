from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.audit_service import AuditService
from app.services.auth_composition import AuthServiceComposition
from app.services.credentials_channel import CredentialsChannel, CredentialsChannelPolicy
from app.services.sms.messages import PasswordSmsReason
from app.services.student_password_sms_factory import StudentPasswordSmsServiceFactory
from app.services.student_password_sms_service import PasswordSmsDestination, PasswordSmsDestinationKind


@dataclass(frozen=True)
class CredentialsDelivery:
    channel: CredentialsChannel
    destination: Optional[PasswordSmsDestination]

    @property
    def masked_phone(self) -> Optional[str]:
        return self.destination.masked_phone if self.destination else None


class CredentialsDeliveryService:
    def __init__(self, db: AsyncSession) -> None:
        self._db: AsyncSession = db
        self._policy: CredentialsChannelPolicy = CredentialsChannelPolicy()
        self._audit_service: AuditService = AuditService(db)

    async def deliver(
        self,
        user: User,
        reason: PasswordSmsReason,
        requested_channel: Optional[CredentialsChannel],
        actor_id: Optional[int],
        enforce_rate_limits: bool,
        parent_link_code: Optional[str] = None,
    ) -> CredentialsDelivery:
        channel: CredentialsChannel = self._policy.resolve(user, requested_channel)
        sms_kind: Optional[PasswordSmsDestinationKind] = channel.sms_kind
        if sms_kind is None:
            await AuthServiceComposition.create(self._db).issue_temporary_credentials(user, parent_link_code)
            await self._audit_service.log(
                actor_id, "update", "user", user.id,
                {"credentials_queued": (None, f"{reason.value}:{channel.value}")},
            )
            return CredentialsDelivery(channel, None)
        destination: PasswordSmsDestination = await StudentPasswordSmsServiceFactory.create(self._db).issue_password(
            user, reason, actor_id, enforce_rate_limits, channel=sms_kind
        )
        return CredentialsDelivery(channel, destination)
