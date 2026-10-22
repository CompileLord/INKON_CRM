from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.access_token_deny_list import AccessTokenDenyList, AccessTokenDenyListUnavailable
from app.core.config import settings
from app.core.security import AccessTokenPrincipal, create_access_token, create_refresh_token, hash_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.interfaces.refresh_token_repository import (
    AuthRefreshTokenRepository,
    ConsumedRefreshToken,
    RotatedRefreshToken,
)
from app.repositories.interfaces.user_repository import AuthUserRepository
from app.schemas.auth import TokenPair


class RefreshTokenReuseDetected(HTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")


class AuthSessionService:
    def __init__(
        self,
        user_repository: AuthUserRepository,
        token_repository: AuthRefreshTokenRepository,
        deny_list: AccessTokenDenyList,
    ) -> None:
        if user_repository is None or token_repository is None or deny_list is None:
            raise ValueError("Session collaborators are required")
        self.user_repo: AuthUserRepository = user_repository
        self.token_repo: AuthRefreshTokenRepository = token_repository
        self.deny_list: AccessTokenDenyList = deny_list

    async def issue_refresh_token(self, user: User, family_id: str | None = None) -> str:
        refresh_token: str = create_refresh_token(user.id)
        stored_token: RefreshToken = RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            family_id=family_id or str(uuid.uuid4()),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        await self.token_repo.create(stored_token)
        return refresh_token

    async def refresh(self, refresh_token: str) -> TokenPair:
        user_id: int = self.decode_refresh_subject(refresh_token)
        user: User | None = await self.user_repo.get_by_id_for_update(user_id)
        if not user or user.is_deleted:
            raise self.invalid_refresh_token()
        now: datetime = datetime.now(timezone.utc)
        token_hash: str = hash_token(refresh_token)
        consumed: ConsumedRefreshToken | None = await self.token_repo.rotate_valid_token(token_hash, user_id, now)
        family_id: str | None
        if consumed is None:
            family_id = await self._family_within_grace(token_hash, user_id, now)
        else:
            family_id = consumed.family_id or str(uuid.uuid4())
        scope: str | None = "must_set_password" if user.must_set_password else None
        new_access_token: str = create_access_token(
            user.id, user.role, scope=scope, auth_version=user.auth_version,
        )
        new_refresh_token: str = await self.issue_refresh_token(user, family_id)
        return TokenPair(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            must_set_password=user.must_set_password,
        )

    async def _family_within_grace(self, token_hash: str, user_id: int, now: datetime) -> str:
        rotated: RotatedRefreshToken | None = await self.token_repo.find_rotated_token(token_hash, user_id)
        if rotated is None:
            raise self.invalid_refresh_token()
        grace: timedelta = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        if now - rotated.rotated_at <= grace:
            if await self.token_repo.family_has_active_token(rotated.family_id, now):
                return rotated.family_id
            raise self.invalid_refresh_token()
        await self.token_repo.revoke_family(rotated.family_id, now)
        raise RefreshTokenReuseDetected()

    async def logout(self, refresh_token: str, access_principal: AccessTokenPrincipal | None = None) -> None:
        if access_principal is not None and access_principal.token_id is not None:
            try:
                await self.deny_list.deny(access_principal.token_id, access_principal.expires_at)
            except AccessTokenDenyListUnavailable:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Session service is currently unavailable. Try again.",
                ) from None
        try:
            user_id: int = self.decode_refresh_subject(refresh_token)
        except HTTPException:
            return
        consumed: ConsumedRefreshToken | None = await self.token_repo.rotate_valid_token(
            hash_token(refresh_token), user_id, datetime.now(timezone.utc)
        )
        if consumed is not None and consumed.family_id is not None:
            await self.token_repo.revoke_family(consumed.family_id, datetime.now(timezone.utc))

    @staticmethod
    def invalid_refresh_token() -> HTTPException:
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    @classmethod
    def decode_refresh_subject(cls, refresh_token: str) -> int:
        try:
            payload: dict[str, Any] = jwt.decode(
                refresh_token, settings.JWT_REFRESH_SECRET_KEY, algorithms=["HS256"],
            )
        except JWTError as exception:
            raise cls.invalid_refresh_token() from exception
        subject: Any = payload.get("sub")
        token_id: Any = payload.get("jti")
        expiration: Any = payload.get("exp")
        issued_at: Any = payload.get("iat")
        if (
            payload.get("type") != "refresh"
            or not isinstance(token_id, str)
            or not token_id
            or not isinstance(subject, str)
            or not subject.isdecimal()
            or not isinstance(expiration, int)
            or isinstance(expiration, bool)
            or not isinstance(issued_at, int)
            or isinstance(issued_at, bool)
        ):
            raise cls.invalid_refresh_token()
        user_id: int = int(subject)
        if user_id <= 0 or str(user_id) != subject:
            raise cls.invalid_refresh_token()
        return user_id
