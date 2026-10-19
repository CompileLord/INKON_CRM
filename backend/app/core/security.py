import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from typing import Callable, TypeVar
from fastapi import HTTPException
import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
from typing import Any, ClassVar, Dict, Optional
from jose import JWTError, jwt
import bcrypt
from app.core.config import settings


@dataclass(frozen=True)
class AccessTokenPrincipal:
    MAX_SUBJECT_ID: ClassVar[int] = (1 << 31) - 1

    subject_id: int
    purpose: str
    scope: Optional[str]
    auth_version: int

    @classmethod
    def from_token(cls, token: str) -> "AccessTokenPrincipal":
        try:
            payload: Dict[str, Any] = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=["HS256"],
            )
        except (TypeError, OverflowError) as exception:
            raise JWTError("Invalid access token claim types") from exception
        subject: Any = payload.get("sub")
        purpose: Any = payload.get("type", "access")
        scope: Any = payload.get("scope")
        expiration: Any = payload.get("exp")
        issued_at: Any = payload.get("iat")
        auth_version: Any = payload.get("auth_version")
        if (
            not isinstance(subject, str)
            or not subject.isascii()
            or not subject.isdecimal()
            or purpose != "access"
            or (scope is not None and scope != "must_set_password")
            or not isinstance(expiration, int)
            or isinstance(expiration, bool)
            or not isinstance(issued_at, int)
            or isinstance(issued_at, bool)
            or not isinstance(auth_version, int)
            or isinstance(auth_version, bool)
            or auth_version < 0
        ):
            raise JWTError("Invalid access token claims")
        try:
            subject_id = int(subject)
        except ValueError as exception:
            raise JWTError("Invalid access token subject") from exception
        if (
            subject_id <= 0
            or subject_id > cls.MAX_SUBJECT_ID
            or str(subject_id) != subject
        ):
            raise JWTError("Invalid access token subject")
        current_timestamp: int = int(datetime.now(timezone.utc).timestamp())
        maximum_lifetime: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        if (
            issued_at > current_timestamp
            or expiration <= current_timestamp
            or expiration <= issued_at
            or expiration - issued_at > maximum_lifetime
        ):
            raise JWTError("Invalid access token time claims")
        return cls(
            subject_id=subject_id,
            purpose=purpose,
            scope=scope,
            auth_version=auth_version,
        )


@dataclass(frozen=True)
class PasswordResetPrincipal:
    MAX_SUBJECT_ID: ClassVar[int] = (1 << 31) - 1
    MAX_LIFETIME_SECONDS: ClassVar[int] = 5 * 60

    subject_id: int
    auth_version: int

    @classmethod
    def from_token(cls, token: str) -> "PasswordResetPrincipal":
        try:
            payload: Dict[str, Any] = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=["HS256"],
            )
        except (TypeError, OverflowError) as exception:
            raise JWTError("Invalid password reset claim types") from exception

        subject: Any = payload.get("sub")
        purpose: Any = payload.get("type")
        expiration: Any = payload.get("exp")
        issued_at: Any = payload.get("iat")
        auth_version: Any = payload.get("auth_version")
        if (
            not isinstance(subject, str)
            or not subject.isascii()
            or not subject.isdecimal()
            or len(subject) > len(str(cls.MAX_SUBJECT_ID))
            or purpose != "password_reset"
            or not isinstance(expiration, int)
            or isinstance(expiration, bool)
            or not isinstance(issued_at, int)
            or isinstance(issued_at, bool)
            or not isinstance(auth_version, int)
            or isinstance(auth_version, bool)
            or auth_version < 0
        ):
            raise JWTError("Invalid password reset claims")

        subject_id: int = int(subject)
        if (
            subject_id <= 0
            or subject_id > cls.MAX_SUBJECT_ID
            or str(subject_id) != subject
        ):
            raise JWTError("Invalid password reset subject")

        current_timestamp: int = int(datetime.now(timezone.utc).timestamp())
        if (
            issued_at > current_timestamp
            or expiration <= current_timestamp
            or expiration <= issued_at
            or expiration - issued_at > cls.MAX_LIFETIME_SECONDS
        ):
            raise JWTError("Invalid password reset time claims")

        return cls(subject_id=subject_id, auth_version=auth_version)


PasswordResult = TypeVar("PasswordResult")


class PasswordWorkService:
    maximum_workers: ClassVar[int] = 2
    maximum_waiters: ClassVar[int] = 64
    maximum_wait_seconds: ClassVar[float] = 5.0
    waiter_slots: ClassVar[BoundedSemaphore] = BoundedSemaphore(maximum_waiters)
    worker_slots: ClassVar[BoundedSemaphore] = BoundedSemaphore(maximum_workers)
    worker_pool: ClassVar[ThreadPoolExecutor] = ThreadPoolExecutor(
        max_workers=maximum_workers, thread_name_prefix="password",
    )

    async def hash(self, password: str) -> str:
        return await self._execute(hash_password, password)

    async def verify(self, password: str, encoded_password: str) -> bool:
        return await self._execute(verify_password, password, encoded_password)

    async def _execute(
        self, operation: Callable[..., PasswordResult], *arguments: str,
    ) -> PasswordResult:
        await self._acquire_worker_slot()
        try:
            loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
            worker: asyncio.Future[PasswordResult] = loop.run_in_executor(
                self.worker_pool, operation, *arguments,
            )
        except BaseException:
            self.worker_slots.release()
            raise
        worker.add_done_callback(self._release_worker_slot)
        return await asyncio.shield(worker)

    async def _acquire_worker_slot(self) -> None:
        if self.worker_slots.acquire(blocking=False):
            return
        if not self.waiter_slots.acquire(blocking=False):
            raise self._overloaded()
        try:
            loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()
            deadline: float = loop.time() + self.maximum_wait_seconds
            while True:
                remaining: float = deadline - loop.time()
                if remaining <= 0:
                    raise self._overloaded()
                if self.worker_slots.acquire(blocking=False):
                    return
                await asyncio.sleep(min(0.01, remaining))
        finally:
            self.waiter_slots.release()

    @staticmethod
    def _overloaded() -> HTTPException:
        return HTTPException(
            status_code=503, detail="Password service is busy; retry later",
            headers={"Retry-After": "1"},
        )

    @classmethod
    def _release_worker_slot(cls, worker: asyncio.Future[PasswordResult]) -> None:
        cls.worker_slots.release()
        if not worker.cancelled():
            worker.exception()


def hash_password(password: str) -> str:
    pwd_bytes: bytes = password.encode("utf-8")
    salt: bytes = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes: bytes = plain_password.encode("utf-8")
    hashed_bytes: bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except ValueError:
        return False


import hmac


def hash_token(token: str) -> str:
    return hmac.new(
        settings.JWT_REFRESH_SECRET_KEY.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


def create_access_token(
    user_id: int,
    role: str,
    scope: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
    auth_version: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    role_str = role.value if hasattr(role, "value") else str(role)
    to_encode: Dict[str, Any] = {
        "sub": str(user_id),
        "role": role_str,
        "type": "access",
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "auth_version": auth_version,
    }
    if scope:
        to_encode["scope"] = scope

    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm="HS256")


def create_refresh_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode: Dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": secrets.token_urlsafe(32),
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    }

    return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")
