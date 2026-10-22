from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Optional, Protocol, TYPE_CHECKING
from fastapi import HTTPException, status
from jose import JWTError, jwt
from app.core.config import settings
from app.core.login_identifier import LoginIdentifier
from app.core.security import (
    PasswordResetPrincipal,
    create_access_token,
    create_refresh_token,
    hash_token,
)
from app.core.verification_codes import (
    ChallengeBackendUnavailable,
    ChallengeOutcome,
    ChallengeResult,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import TokenPair
from app.models.outbox_event import OutboxEvent
from app.repositories.interfaces.user_repository import AuthUserRepository
from app.repositories.interfaces.refresh_token_repository import AuthRefreshTokenRepository
from app.services.sms.messages import PasswordSmsReason
from app.services.auth_collaborators import (
    AuthChallengeConsumer, AuthChallengeWriter, AuthMailOutbox, AuthPasswordSms,
    AuthPasswordWork, AuthPendingPasswordHasher, AuthSmsBudget, AuthTemporaryPasswordGenerator,
)
if TYPE_CHECKING:
    from app.services.student_password_sms_service import (
        PasswordSmsDestination,
        PasswordSmsDestinationKind,
    )


class AuthService:
    def __init__(
        self,
        user_repository: AuthUserRepository,
        token_repository: AuthRefreshTokenRepository,
        outbox_service: AuthMailOutbox,
        password_work_service: AuthPasswordWork,
        temporary_password_generator: AuthTemporaryPasswordGenerator,
        pending_password_hasher: AuthPendingPasswordHasher,
        challenge_writer: AuthChallengeWriter,
        challenge_consumer: AuthChallengeConsumer,
        sms_service: AuthPasswordSms,
        sms_budget: AuthSmsBudget,
    ) -> None:
        collaborators: tuple[object, ...] = (
            user_repository, token_repository, outbox_service, password_work_service,
            temporary_password_generator, pending_password_hasher, challenge_writer,
            challenge_consumer, sms_service, sms_budget,
        )
        if any(collaborator is None for collaborator in collaborators):
            raise ValueError("Authentication collaborators are required")
        self.user_repo: AuthUserRepository = user_repository
        self.token_repo: AuthRefreshTokenRepository = token_repository
        self.outbox_service: AuthMailOutbox = outbox_service
        self.password_work_service: AuthPasswordWork = password_work_service
        self.temporary_password_generator: AuthTemporaryPasswordGenerator = temporary_password_generator
        self.pending_password_hasher: AuthPendingPasswordHasher = pending_password_hasher
        self.challenge_writer: AuthChallengeWriter = challenge_writer
        self.challenge_consumer: AuthChallengeConsumer = challenge_consumer
        self.sms_service: AuthPasswordSms = sms_service
        self.sms_budget: AuthSmsBudget = sms_budget

    async def login(self, identifier: LoginIdentifier, password: str) -> TokenPair:
        user: User | None = await self.user_repo.get_by_login_for_update(identifier)
        if not user or user.is_deleted:
            await self.password_work_service.hash("invalid-login-placeholder")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid login or password"
            )

        current_password_matches: bool = bool(user.password_hash) and await self.password_work_service.verify(
            password, user.password_hash
        )
        pending_password_matches: bool = (
            user.pending_password_hash is not None
            and user.pending_password_expires_at is not None
            and user.pending_password_expires_at > datetime.now(timezone.utc)
            and self.pending_password_hasher.verify(user.id, password, user.pending_password_hash)
        )
        if not current_password_matches and not pending_password_matches:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid login or password"
            )
        if pending_password_matches and not current_password_matches:
            user.password_hash = await self.password_work_service.hash(password)
            user.pending_password_hash = None
            user.pending_password_expires_at = None
            user.must_set_password = False
            user.auth_version += 1
            await self.user_repo.update(user)
            await self.revoke_all_user_tokens(user.id)

        scope: str | None = "must_set_password" if user.must_set_password else None
        access_token: str = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        refresh_token: str = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        user_id: int = self._decode_refresh_subject(refresh_token)
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise self._invalid_refresh_token()
        consumed: bool = await self.token_repo.consume_valid_token(
            hash_token(refresh_token), user_id, datetime.now(timezone.utc)
        )
        if not consumed:
            raise self._invalid_refresh_token()

        scope: str | None = "must_set_password" if user.must_set_password else None
        new_access_token: str = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        new_refresh_token: str = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            must_set_password=user.must_set_password
        )

    async def logout(self, refresh_token: str) -> None:
        try:
            user_id: int = self._decode_refresh_subject(refresh_token)
        except HTTPException:
            return
        await self.token_repo.consume_valid_token(
            hash_token(refresh_token), user_id, datetime.now(timezone.utc)
        )

    @staticmethod
    def _invalid_refresh_token() -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    @classmethod
    def _decode_refresh_subject(cls, refresh_token: str) -> int:
        try:
            payload: dict[str, Any] = jwt.decode(
                refresh_token,
                settings.JWT_REFRESH_SECRET_KEY,
                algorithms=["HS256"],
            )
        except JWTError as exception:
            raise cls._invalid_refresh_token() from exception

        subject: Any = payload.get("sub")
        token_type: Any = payload.get("type")
        token_id: Any = payload.get("jti")
        expiration: Any = payload.get("exp")
        issued_at: Any = payload.get("iat")
        if (
            token_type != "refresh"
            or not isinstance(token_id, str)
            or not token_id
            or not isinstance(subject, str)
            or not subject.isdecimal()
            or not isinstance(expiration, int)
            or isinstance(expiration, bool)
            or not isinstance(issued_at, int)
            or isinstance(issued_at, bool)
        ):
            raise cls._invalid_refresh_token()

        user_id: int = int(subject)
        if user_id <= 0 or str(user_id) != subject:
            raise cls._invalid_refresh_token()
        return user_id

    async def _issue_refresh_token(self, user: User) -> str:
        refresh_token: str = create_refresh_token(user.id)
        stored_token: RefreshToken = RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        await self.token_repo.create(stored_token)
        return refresh_token

    async def revoke_all_user_tokens(self, user_id: int) -> None:
        await self.token_repo.revoke_all_for_user(user_id)

    async def issue_temporary_credentials(self, user: User, parent_link_code: Optional[str] = None) -> None:
        if not user.email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The account has no email for emailed credentials",
            )
        temporary_password: str = self.temporary_password_generator.generate()
        user.password_hash = await self.password_work_service.hash(temporary_password)
        user.must_set_password = True
        user.auth_version += 1
        await self.user_repo.update(user)
        await self.revoke_all_user_tokens(user.id)
        await self.outbox_service.enqueue_credentials_email(
            recipient_email=user.email,
            first_name=user.first_name,
            temporary_password=temporary_password,
            correlation_key=f"credentials:{user.email}",
            parent_link_code=parent_link_code,
        )

    async def generate_verification_code(self, email: str) -> str:
        code: str = str(secrets.randbelow(900000) + 100000)
        key: str = f"auth:code:{email}"
        data: dict[str, Any] = {"code": code, "attempts": 0}
        await self.challenge_writer.set(key, json.dumps(data), ex=600)
        await self.outbox_service.enqueue_verification_email(
            recipient_email=email,
            code=code,
            correlation_key=f"verification:{email}",
        )
        return code


    async def verify_code(self, email: str, code: str) -> TokenPair:
        await self._consume_challenge(f"auth:code:{email}", code, "Verification")

        user: User | None = await self.user_repo.get_by_email_for_update(email)
        if not user or user.is_deleted:
            raise self._challenge_unavailable("Verification")

        access_token: str = create_access_token(
            user.id,
            user.role,
            scope="must_set_password",
            auth_version=user.auth_version,
        )
        return TokenPair(
            access_token=access_token,
            must_set_password=True
        )

    async def resend_code(self, email: str) -> None:
        user: User | None = await self.user_repo.get_by_email_for_update(email)
        if user is None or user.is_deleted or not user.must_set_password:
            return
        await self.issue_temporary_credentials(user)

    async def set_password(self, user_id: int, new_password: str) -> TokenPair:
        if len(new_password) < 8 or not any(char.isdigit() for char in new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters and contain at least 1 digit"
            )

        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.pending_password_hash = None
        user.pending_password_expires_at = None
        user.password_hash = await self.password_work_service.hash(new_password)
        user.must_set_password = False
        user.auth_version += 1
        await self.user_repo.update(user)

        await self.revoke_all_user_tokens(user.id)

        access_token: str = create_access_token(
            user.id,
            user.role,
            auth_version=user.auth_version,
        )
        refresh_token: str = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=False
        )

    async def change_password(self, user_id: int, current_password: str, new_password: str) -> TokenPair:
        if len(new_password) < 8 or not any(char.isdigit() for char in new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters and contain at least 1 digit"
            )
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if not user.password_hash or not await self.password_work_service.verify(
            current_password, user.password_hash
        ):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password")
        return await self._replace_password(user, new_password)

    async def _replace_password(self, user: User, new_password: str) -> TokenPair:
        user.pending_password_hash = None
        user.pending_password_expires_at = None
        user.password_hash = await self.password_work_service.hash(new_password)
        user.must_set_password = False
        user.auth_version += 1
        await self.user_repo.update(user)
        await self.revoke_all_user_tokens(user.id)
        access_token: str = create_access_token(user.id, user.role, auth_version=user.auth_version)
        refresh_token: str = await self._issue_refresh_token(user)
        return TokenPair(access_token=access_token, refresh_token=refresh_token, must_set_password=False)

    async def password_reset_request(
        self,
        identifier: LoginIdentifier,
        channel: Optional[PasswordSmsDestinationKind] = None,
        client_ip: Optional[str] = None,
    ) -> None:
        user: User | None = await self.user_repo.get_by_login_for_update(identifier)
        if user is None or user.is_deleted:
            return
        sms_service: AuthPasswordSms = self.sms_service
        if channel is not None:
            await self._issue_reset_sms(sms_service, user, channel, client_ip)
            return
        if user.email:
            await self._issue_reset_email(user.email)
            return
        default_destination: PasswordSmsDestination | None = sms_service.resolve_destination(user)
        if default_destination is not None:
            await self._issue_reset_sms(sms_service, user, default_destination.kind, client_ip)

    async def _issue_reset_sms(
        self,
        sms_service: AuthPasswordSms,
        user: User,
        kind: PasswordSmsDestinationKind,
        client_ip: Optional[str],
    ) -> None:
        if sms_service.resolve_channel_destination(user, kind) is None:
            return
        try:
            if client_ip is not None:
                await self.sms_budget.consume_ip_budget(client_ip)
            await sms_service.issue_password(
                user, PasswordSmsReason.RESET, None, enforce_rate_limits=True, channel=kind
            )
        except HTTPException as error:
            if error.status_code != status.HTTP_429_TOO_MANY_REQUESTS:
                raise

    async def _issue_reset_email(self, email: str) -> None:
        code: str = str(secrets.randbelow(900000) + 100000)
        key: str = f"auth:reset:{email}"
        data: dict[str, Any] = {"code": code, "attempts": 0}
        await self.challenge_writer.set(key, json.dumps(data), ex=600)
        await self.outbox_service.enqueue_password_reset_email(
            recipient_email=email,
            code=code,
            correlation_key=f"reset:{email}",
        )

    async def password_reset_verify(self, email: str, code: str) -> str:
        await self._consume_challenge(f"auth:reset:{email}", code, "Reset")

        user: User | None = await self.user_repo.get_by_email_for_update(email)
        if not user or user.is_deleted:
            raise self._challenge_unavailable("Reset")

        now: datetime = datetime.now(timezone.utc)
        expire: datetime = now + timedelta(minutes=5)
        to_encode: dict[str, Any] = {
            "sub": str(user.id),
            "type": "password_reset",
            "exp": int(expire.timestamp()),
            "iat": int(now.timestamp()),
            "auth_version": user.auth_version,
        }
        reset_token: str = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
        return reset_token

    @staticmethod
    def _challenge_unavailable(label: str) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} code expired or not requested",
        )

    async def _consume_challenge(self, key: str, code: str, label: str) -> None:
        try:
            result: ChallengeResult = await self.challenge_consumer.consume(key, code)
        except ChallengeBackendUnavailable:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Verification service is currently unavailable. Request a new code and try again.",
            ) from None
        if result.outcome == ChallengeOutcome.CONSUMED:
            return
        if result.outcome == ChallengeOutcome.EXHAUSTED:
            detail: str = "Too many incorrect attempts. Code invalidated."
        elif result.outcome == ChallengeOutcome.INVALID:
            detail = f"Invalid {label.lower()} code"
        else:
            detail = f"{label} code expired or not requested"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    async def password_reset_confirm(self, reset_token: str, new_password: str) -> TokenPair:
        if len(new_password) < 8 or not any(char.isdigit() for char in new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters and contain at least 1 digit"
            )

        try:
            principal: PasswordResetPrincipal = PasswordResetPrincipal.from_token(reset_token)
        except JWTError as exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            ) from exception

        user: User | None = await self.user_repo.get_by_id_for_update(principal.subject_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        if user.auth_version != principal.auth_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        user.pending_password_hash = None
        user.pending_password_expires_at = None
        user.password_hash = await self.password_work_service.hash(new_password)
        user.auth_version += 1
        await self.user_repo.update(user)

        await self.revoke_all_user_tokens(user.id)

        scope: str | None = "must_set_password" if user.must_set_password else None
        access_token: str = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        refresh_token: str = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )
