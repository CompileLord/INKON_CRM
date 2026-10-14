import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError, jwt
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, hash_token, hash_password, verify_password
from app.core.redis import redis_client
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.repositories.sqlalchemy.user_repository import SQLAlchemyUserRepository
from app.schemas.auth import TokenPair
from app.services.email_service import EmailService


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = SQLAlchemyUserRepository(db)
        self.token_repo = SQLAlchemyRefreshTokenRepository(db)
        self.email_service = EmailService()

    async def login(self, email: str, password: str) -> TokenPair:
        user = await self.user_repo.get_by_email(email)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        if not user.password_hash or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        scope = "must_set_password" if user.must_set_password else None
        access_token = create_access_token(user.id, user.role, scope=scope)
        refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )

    async def refresh(self, refresh_token: str) -> TokenPair:
        user_id = self._decode_refresh_subject(refresh_token)
        consumed = await self.token_repo.consume_valid_token(
            hash_token(refresh_token), user_id, datetime.now(timezone.utc)
        )
        if not consumed:
            raise self._invalid_refresh_token()

        user = await self.user_repo.get_by_id(user_id)
        if not user or user.is_deleted:
            raise self._invalid_refresh_token()

        scope = "must_set_password" if user.must_set_password else None
        new_access_token = create_access_token(user.id, user.role, scope=scope)
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

    async def generate_verification_code(self, email: str) -> str:
        code = str(secrets.randbelow(900000) + 100000)
        key = f"auth:code:{email}"
        data = {"code": code, "attempts": 0}
        await redis_client.set(key, json.dumps(data), ex=600)
        await self.email_service.send_email(
            to_email=email,
            subject="Verification Code",
            body=f"Your verification code is: {code}"
        )
        return code

    async def verify_code(self, email: str, code: str) -> TokenPair:
        key = f"auth:code:{email}"
        raw_data = await redis_client.get(key)
        if not raw_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code expired or not requested"
            )

        data = json.loads(raw_data)
        if data.get("attempts", 0) >= 5:
            await redis_client.delete(key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many incorrect attempts. Code invalidated."
            )

        data["attempts"] += 1
        await redis_client.set(key, json.dumps(data), keepttl=True)

        if data["code"] != code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code"
            )

        await redis_client.delete(key)

        user = await self.user_repo.get_by_email(email)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        access_token = create_access_token(user.id, user.role, scope="must_set_password")
        return TokenPair(
            access_token=access_token,
            must_set_password=True
        )

    async def resend_code(self, email: str) -> None:
        user = await self.user_repo.get_by_email(email)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not user.must_set_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password already set"
            )

        await self.generate_verification_code(email)

    async def set_password(self, user_id: int, new_password: str) -> TokenPair:
        if len(new_password) < 8 or not any(char.isdigit() for char in new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters and contain at least 1 digit"
            )

        user = await self.user_repo.get_by_id(user_id)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.password_hash = hash_password(new_password)
        user.must_set_password = False
        await self.user_repo.update(user)

        await self.revoke_all_user_tokens(user.id)

        access_token = create_access_token(user.id, user.role)
        refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=False
        )

    async def password_reset_request(self, email: str) -> None:
        user = await self.user_repo.get_by_email(email)
        if not user or user.is_deleted:
            return

        code = str(secrets.randbelow(900000) + 100000)
        key = f"auth:reset:{email}"
        data = {"code": code, "attempts": 0}
        await redis_client.set(key, json.dumps(data), ex=600)
        await self.email_service.send_email(
            to_email=email,
            subject="Password Reset Code",
            body=f"Your password reset code is: {code}"
        )

    async def password_reset_verify(self, email: str, code: str) -> str:
        key = f"auth:reset:{email}"
        raw_data = await redis_client.get(key)
        if not raw_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset code expired or not requested"
            )

        data = json.loads(raw_data)
        if data.get("attempts", 0) >= 5:
            await redis_client.delete(key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many incorrect attempts. Reset code invalidated."
            )

        data["attempts"] += 1
        await redis_client.set(key, json.dumps(data), keepttl=True)

        if data["code"] != code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset code"
            )

        await redis_client.delete(key)

        now = datetime.now(timezone.utc)
        expire = now + timedelta(minutes=5)
        to_encode = {
            "sub": email,
            "type": "password_reset",
            "exp": int(expire.timestamp()),
            "iat": int(now.timestamp())
        }
        reset_token = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")
        return reset_token

    async def password_reset_confirm(self, reset_token: str, new_password: str) -> TokenPair:
        if len(new_password) < 8 or not any(char.isdigit() for char in new_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 8 characters and contain at least 1 digit"
            )

        try:
            payload = jwt.decode(reset_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
            token_type = payload.get("type")
            if token_type != "password_reset":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid token type"
                )
            email = payload.get("sub")
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        user = await self.user_repo.get_by_email(email)
        if not user or user.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.password_hash = hash_password(new_password)
        await self.user_repo.update(user)

        await self.revoke_all_user_tokens(user.id)

        access_token = create_access_token(user.id, user.role)
        refresh_token = await self._issue_refresh_token(user)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            must_set_password=user.must_set_password
        )
