from __future__ import annotations

from typing import Any, Protocol, TYPE_CHECKING
from app.core.verification_codes import ChallengeResult
from app.models.outbox_event import OutboxEvent
from app.core.security import AccessTokenPrincipal
from app.models.user import User
from app.schemas.auth import TokenPair
from app.services.sms.messages import PasswordSmsReason
if TYPE_CHECKING:
    from app.services.student_password_sms_service import (
        PasswordSmsDestination,
        PasswordSmsDestinationKind,
    )


class AuthPasswordWork(Protocol):
    async def hash(self, password: str) -> str: ...

    async def verify(self, password: str, encoded_password: str) -> bool: ...


class AuthPendingPasswordHasher(Protocol):
    def verify(self, user_id: int, code: str, password_hash: str) -> bool: ...


class AuthTemporaryPasswordGenerator(Protocol):
    def generate(self) -> str: ...


class AuthChallengeWriter(Protocol):
    async def set(self, key: str, value: str, *, ex: int) -> Any: ...


class AuthChallengeConsumer(Protocol):
    async def consume(self, key: str, supplied_code: str) -> ChallengeResult: ...


class AuthSmsBudget(Protocol):
    async def consume_ip_budget(self, client_ip: str) -> None: ...


class AuthPasswordSms(Protocol):
    def resolve_destination(self, user: User) -> PasswordSmsDestination | None: ...

    def resolve_channel_destination(self, user: User, kind: PasswordSmsDestinationKind) -> PasswordSmsDestination | None: ...

    async def issue_password(
        self, user: User, reason: PasswordSmsReason, actor_id: int | None,
        enforce_rate_limits: bool, channel: PasswordSmsDestinationKind,
    ) -> PasswordSmsDestination: ...


class AuthMailOutbox(Protocol):
    async def enqueue_verification_email(
        self, recipient_email: str, code: str, correlation_key: str | None = None,
    ) -> OutboxEvent: ...

    async def enqueue_password_reset_email(
        self, recipient_email: str, code: str, correlation_key: str | None = None,
    ) -> OutboxEvent: ...

    async def enqueue_credentials_email(
        self, recipient_email: str, first_name: str, temporary_password: str,
        correlation_key: str | None = None, parent_link_code: str | None = None,
    ) -> OutboxEvent: ...


class AuthSessions(Protocol):
    async def issue_refresh_token(self, user: User, family_id: str | None = None) -> str: ...

    async def refresh(self, refresh_token: str) -> TokenPair: ...

    async def logout(self, refresh_token: str, access_principal: AccessTokenPrincipal | None = None) -> None: ...
