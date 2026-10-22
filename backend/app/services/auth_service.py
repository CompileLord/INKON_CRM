import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from app.core.config import settings
from app.core.login_identifier import LoginIdentifier
from app.core.sms_rate_limiter import PasswordSmsRateLimiter
from app.core.security import (
    PasswordResetPrincipal,
    create_access_token,
    create_refresh_token,
    hash_token,
    PasswordWorkService,
)
from app.core.redis import redis_client
from app.core.temporary_passwords import TemporaryPasswordGenerator
from app.core.student_passwords import PendingStudentPasswordHasher
from app.core.verification_codes import (
    ChallengeBackendUnavailable,
    ChallengeOutcome,
    ChallengeResult,
    VerificationCodeStore,
)
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.schemas.auth import TokenPair
from app.services.email_service import EmailService
from app.services.outbox_service import OutboxService
from app.services.sms.messages import PasswordSmsReason
from app.services.student_password_sms_factory import StudentPasswordSmsServiceFactory
from app.services.student_password_sms_service import (
    PasswordSmsDestination,
    PasswordSmsDestinationKind,
    StudentPasswordSmsService,
)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.password_work_service: PasswordWorkService = PasswordWorkService()
        self.db = db
        self.user_repo = SQLAlchemyUserRepository(db)
        self.token_repo = SQLAlchemyRefreshTokenRepository(db)
        self.email_service = EmailService()
        self.outbox_repo = SQLAlchemyOutboxRepository(db)
        self.outbox_service = OutboxService(self.outbox_repo, settings.JWT_SECRET_KEY)
        self.temporary_password_generator = TemporaryPasswordGenerator()

    async def login(self, identifier: LoginIdentifier, password: str) -> TokenPair:
        user = await self.user_repo.get_by_login_for_update(identifier)
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
            and PendingStudentPasswordHasher(settings.JWT_SECRET_KEY).verify(user.id, password, user.pending_password_hash)
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

        scope = "must_set_password" if user.must_set_password else None
        access_token = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        user_id = self._decode_refresh_subject(refresh_token)
        user = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise self._invalid_refresh_token()
        consumed = await self.token_repo.consume_valid_token(
            hash_token(refresh_token), user_id, datetime.now(timezone.utc)
        )
        if not consumed:
            raise self._invalid_refresh_token()

        scope = "must_set_password" if user.must_set_password else None
        new_access_token = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        new_refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            must_set_password=user.must_set_password
        )

    async def logout(self, refresh_token: str) -> None:
        try:
            user_id = self._decode_refresh_subject(refresh_token)
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

        user_id = int(subject)
        if user_id <= 0 or str(user_id) != subject:
            raise cls._invalid_refresh_token()
        return user_id

    async def _issue_refresh_token(self, user: User) -> str:
        refresh_token = create_refresh_token(user.id)
        stored_token = RefreshToken(
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
        code = str(secrets.randbelow(900000) + 100000)
        key = f"auth:code:{email}"
        data = {"code": code, "attempts": 0}
        await redis_client.set(key, json.dumps(data), ex=600)
        await self.outbox_service.enqueue_verification_email(
            recipient_email=email,
            code=code,
            correlation_key=f"verification:{email}",
        )
        return code


    async def verify_code(self, email: str, code: str) -> TokenPair:
        await self._consume_challenge(f"auth:code:{email}", code, "Verification")

        user = await self.user_repo.get_by_email_for_update(email)
        if not user or user.is_deleted:
            raise self._challenge_unavailable("Verification")

        access_token = create_access_token(
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

        user = await self.user_repo.get_by_id_for_update(user_id)
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

        access_token = create_access_token(
            user.id,
            user.role,
            auth_version=user.auth_version,
        )
        refresh_token = await self._issue_refresh_token(user)

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
        user = await self.user_repo.get_by_id_for_update(user_id)
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
        access_token = create_access_token(user.id, user.role, auth_version=user.auth_version)
        refresh_token = await self._issue_refresh_token(user)
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
        sms_service: StudentPasswordSmsService = StudentPasswordSmsServiceFactory.create(self.db)
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
        sms_service: StudentPasswordSmsService,
        user: User,
        kind: PasswordSmsDestinationKind,
        client_ip: Optional[str],
    ) -> None:
        if sms_service.resolve_channel_destination(user, kind) is None:
            return
        try:
            if client_ip is not None:
                await PasswordSmsRateLimiter().consume_ip_budget(client_ip)
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
        await redis_client.set(key, json.dumps(data), ex=600)
        await self.outbox_service.enqueue_password_reset_email(
            recipient_email=email,
            code=code,
            correlation_key=f"reset:{email}",
        )

    async def password_reset_verify(self, email: str, code: str) -> str:
        await self._consume_challenge(f"auth:reset:{email}", code, "Reset")

        user = await self.user_repo.get_by_email_for_update(email)
        if not user or user.is_deleted:
            raise self._challenge_unavailable("Reset")

        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=5)
        to_encode = {
            "sub": str(user.id),
            "type": "password_reset",
            "exp": int(expire.timestamp()),
            "iat": int(now.timestamp()),
            "auth_version": user.auth_version,
        }
        reset_token = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
        return reset_token

    @staticmethod
    def _challenge_unavailable(label: str) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} code expired or not requested",
        )

    async def _consume_challenge(self, key: str, code: str, label: str) -> None:
        store: VerificationCodeStore = VerificationCodeStore(redis_client)
        try:
            result: ChallengeResult = await store.consume(key, code)
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

        user = await self.user_repo.get_by_id_for_update(principal.subject_id)
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

        scope = "must_set_password" if user.must_set_password else None
        access_token = create_access_token(
            user.id,
            user.role,
            scope=scope,
            auth_version=user.auth_version,
        )
        refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )
