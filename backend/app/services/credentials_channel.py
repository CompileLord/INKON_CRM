from enum import Enum
from typing import Optional

from fastapi import HTTPException, status

from app.models.user import User, UserRole
from app.services.sms.sender import ProviderPhoneFormatter
from app.services.student_password_sms_service import PasswordSmsDestinationKind


class CredentialsChannel(str, Enum):
    EMAIL = "email"
    STUDENT_PHONE = "student_phone"
    PARENT_PHONE = "parent_phone"

    @property
    def sms_kind(self) -> Optional[PasswordSmsDestinationKind]:
        if self == CredentialsChannel.STUDENT_PHONE:
            return PasswordSmsDestinationKind.STUDENT_PHONE
        if self == CredentialsChannel.PARENT_PHONE:
            return PasswordSmsDestinationKind.PARENT_PHONE
        return None


class CredentialsChannelPolicy:
    def __init__(self) -> None:
        self._phone_formatter: ProviderPhoneFormatter = ProviderPhoneFormatter()

    def available(self, user: User) -> list[CredentialsChannel]:
        channels: list[CredentialsChannel] = []
        if user.email:
            channels.append(CredentialsChannel.EMAIL)
        if user.role == UserRole.STUDENT:
            if self._phone_formatter.is_deliverable(user.phone):
                channels.append(CredentialsChannel.STUDENT_PHONE)
            if self._phone_formatter.is_deliverable(user.parent_phone):
                channels.append(CredentialsChannel.PARENT_PHONE)
        return channels

    def default(self, user: User) -> Optional[CredentialsChannel]:
        available_channels: list[CredentialsChannel] = self.available(user)
        return available_channels[0] if available_channels else None

    def resolve(self, user: User, requested: Optional[CredentialsChannel]) -> CredentialsChannel:
        resolved: Optional[CredentialsChannel] = requested or self.default(user)
        if resolved is None or resolved not in self.available(user):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{
                    "loc": ["body", "channel"],
                    "msg": "The account has no contact for this credentials channel",
                    "type": "value_error",
                }],
            )
        return resolved
