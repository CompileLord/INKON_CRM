import asyncio
from datetime import datetime, timedelta, timezone, tzinfo
from secrets import token_urlsafe

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.security import hash_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.sqlalchemy.refresh_token_repository import SQLAlchemyRefreshTokenRepository
from app.services.auth_service import AuthService


class FrozenTokenDatetime(datetime):
    instant: datetime = datetime.now(timezone.utc).replace(microsecond=0)

    @classmethod
    def now(cls, tz: tzinfo | None = None) -> datetime:
        return cls.instant.astimezone(tz) if tz else cls.instant.replace(tzinfo=None)


def encode_refresh_claims(
    subject: str | None,
    token_type: str | None,
    expires_at: datetime | None,
    include_token_id: bool = True,
    include_expiration: bool = True,
    include_issued_at: bool = True,
) -> str:
    claims: dict[str, str | int] = {}
    if include_expiration and expires_at is not None:
        claims["exp"] = int(expires_at.timestamp())
    if include_issued_at:
        claims["iat"] = int(datetime.now(timezone.utc).timestamp())
    if include_token_id:
        claims["jti"] = token_urlsafe(32)
    if subject is not None:
        claims["sub"] = subject
    if token_type is not None:
        claims["type"] = token_type
    return jwt.encode(claims, settings.JWT_REFRESH_SECRET_KEY, algorithm="HS256")


async def issue_stored_refresh_token(
    session: AsyncSession,
    user: User,
    token: str,
    expires_at: datetime | None = None,
) -> RefreshToken:
    stored_token: RefreshToken = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=expires_at or datetime.now(timezone.utc) + timedelta(days=1),
    )
    session.add(stored_token)
    await session.commit()
    return stored_token


@pytest.mark.parametrize(
    "claim_failure",
    [
        "missing_subject",
        "wrong_purpose",
        "mismatched_subject",
        "missing_token_id",
        "missing_expiration",
        "missing_issued_at",
        "noncanonical_subject",
    ],
)
@pytest.mark.asyncio
async def test_refresh_rejects_invalid_identity_and_purpose_claims(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
    claim_failure: str,
) -> None:
    expires_at: datetime = datetime.now(timezone.utc) + timedelta(minutes=5)
    subject: str | None = str(test_student.id)
    token_type: str = "access" if claim_failure == "wrong_purpose" else "refresh"
    include_token_id: bool = claim_failure != "missing_token_id"
    include_expiration: bool = claim_failure != "missing_expiration"
    include_issued_at: bool = claim_failure != "missing_issued_at"
    if claim_failure == "missing_subject":
        subject = None
    if claim_failure == "mismatched_subject":
        subject = str(test_admin.id)
    if claim_failure == "noncanonical_subject":
        subject = f"0{test_student.id}"
    token: str = encode_refresh_claims(
        subject,
        token_type,
        expires_at,
        include_token_id,
        include_expiration,
        include_issued_at,
    )
    await issue_stored_refresh_token(db_session, test_student, token)
    with pytest.raises(HTTPException) as failure:
        await AuthService(db_session).refresh(token)
    assert failure.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rejects_expired_credential(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    expired_at: datetime = datetime.now(timezone.utc) - timedelta(minutes=1)
    expired_token: str = encode_refresh_claims(str(test_student.id), "refresh", expired_at)
    await issue_stored_refresh_token(db_session, test_student, expired_token, expired_at)
    with pytest.raises(HTTPException) as failure:
        await AuthService(db_session).refresh(expired_token)
    assert failure.value.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rejects_valid_jwt_with_expired_database_credential(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    valid_jwt_expiration: datetime = datetime.now(timezone.utc) + timedelta(minutes=5)
    expired_database_expiration: datetime = datetime.now(timezone.utc) - timedelta(minutes=1)
    token: str = encode_refresh_claims(str(test_student.id), "refresh", valid_jwt_expiration)
    await issue_stored_refresh_token(db_session, test_student, token, expired_database_expiration)
    assert jwt.decode(token, settings.JWT_REFRESH_SECRET_KEY, algorithms=["HS256"])["exp"] > int(
        datetime.now(timezone.utc).timestamp()
    )
    with pytest.raises(HTTPException) as failure:
        await AuthService(db_session).refresh(token)
    assert failure.value.status_code == 401


@pytest.mark.asyncio
async def test_same_user_refresh_rotation_succeeds_once(
    client: AsyncClient,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.security.datetime", FrozenTokenDatetime)
    login = await client.post(
        "/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"}
    )
    assert login.status_code == 200
    original_token: str = login.json()["refresh_token"]
    first_rotation = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": original_token}
    )
    assert first_rotation.status_code == 200
    first_rotated_token: str = first_rotation.json()["refresh_token"]
    second_rotation = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first_rotated_token}
    )
    assert second_rotation.status_code == 200
    second_rotated_token: str = second_rotation.json()["refresh_token"]
    token_claims: list[dict[str, object]] = [
        jwt.decode(token, settings.JWT_REFRESH_SECRET_KEY, algorithms=["HS256"])
        for token in (original_token, first_rotated_token, second_rotated_token)
    ]
    assert len({original_token, first_rotated_token, second_rotated_token}) == 3
    assert all(claims["sub"] == str(test_student.id) for claims in token_claims)
    assert all(claims["type"] == "refresh" for claims in token_claims)
    token_ids: list[str] = [str(claims["jti"]) for claims in token_claims]
    assert all(token_ids)
    assert len(set(token_ids)) == 3


@pytest.mark.asyncio
async def test_set_password_issues_identity_bound_refresh_credential(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    result = await AuthService(db_session).set_password(test_student.id, "changedPass123")
    claims: dict[str, object] = jwt.decode(
        result.refresh_token,
        settings.JWT_REFRESH_SECRET_KEY,
        algorithms=["HS256"],
    )
    assert claims["sub"] == str(test_student.id)
    assert claims["type"] == "refresh"
    assert isinstance(claims["jti"], str) and claims["jti"]


@pytest.mark.asyncio
async def test_password_reset_issues_identity_bound_refresh_credential(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    reset_token: str = jwt.encode(
        {
            "sub": test_student.email,
            "type": "password_reset",
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    result = await AuthService(db_session).password_reset_confirm(reset_token, "resetPass123")
    claims: dict[str, object] = jwt.decode(
        result.refresh_token,
        settings.JWT_REFRESH_SECRET_KEY,
        algorithms=["HS256"],
    )
    assert claims["sub"] == str(test_student.id)
    assert claims["type"] == "refresh"
    assert isinstance(claims["jti"], str) and claims["jti"]


@pytest.mark.asyncio
async def test_logout_revokes_only_the_supplied_user_credential(
    client: AsyncClient,
    test_admin: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.core.security.datetime", FrozenTokenDatetime)
    admin_login = await client.post(
        "/api/v1/auth/login", json={"email": test_admin.email, "password": "admin_pass123"}
    )
    student_login = await client.post(
        "/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"}
    )
    assert admin_login.status_code == 200
    assert student_login.status_code == 200
    admin_token: str = admin_login.json()["refresh_token"]
    student_token: str = student_login.json()["refresh_token"]
    assert admin_token != student_token
    logout_response = await client.post("/api/v1/auth/logout", json={"refresh_token": admin_token})
    assert logout_response.status_code == 204
    admin_replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": admin_token})
    student_rotation = await client.post("/api/v1/auth/refresh", json={"refresh_token": student_token})
    assert admin_replay.status_code == 401
    assert student_rotation.status_code == 200
    assert jwt.decode(
        student_rotation.json()["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"]
    )["sub"] == str(test_student.id)


@pytest.mark.asyncio
async def test_refresh_rotation_replay_has_exactly_one_successor(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind, expire_on_commit=False
    )
    original_token: str = encode_refresh_claims(
        str(test_student.id), "refresh", datetime.now(timezone.utc) + timedelta(minutes=5)
    )
    await issue_stored_refresh_token(db_session, test_student, original_token)
    barrier: asyncio.Barrier = asyncio.Barrier(2)

    async def rotate() -> bool:
        async with session_factory() as session:
            await session.execute(text("SELECT pg_backend_pid()"))
            await barrier.wait()
            try:
                await AuthService(session).refresh(original_token)
                await session.commit()
                return True
            except HTTPException as failure:
                await session.rollback()
                assert failure.status_code == 401
                return False

    outcomes: list[bool] = await asyncio.gather(rotate(), rotate())
    assert sum(outcomes) == 1
    stored_tokens: list[RefreshToken] = list(
        (
            await db_session.execute(
                select(RefreshToken).where(RefreshToken.user_id == test_student.id)
            )
        ).scalars()
    )
    assert sum(token.revoked_at is None for token in stored_tokens) == 1
    assert len(stored_tokens) == 2


@pytest.mark.asyncio
async def test_failed_rotation_rolls_back_original_token_consumption(
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_token: str = encode_refresh_claims(
        str(test_student.id), "refresh", datetime.now(timezone.utc) + timedelta(minutes=5)
    )
    await issue_stored_refresh_token(db_session, test_student, original_token)
    original_create = SQLAlchemyRefreshTokenRepository.create

    async def fail_successor_creation(
        repository: SQLAlchemyRefreshTokenRepository, entity: RefreshToken
    ) -> RefreshToken:
        raise RuntimeError("synthetic successor insert failure")

    monkeypatch.setattr(SQLAlchemyRefreshTokenRepository, "create", fail_successor_creation)
    with pytest.raises(RuntimeError, match="synthetic successor insert failure"):
        await AuthService(db_session).refresh(original_token)
    await db_session.rollback()
    monkeypatch.setattr(SQLAlchemyRefreshTokenRepository, "create", original_create)
    rotated = await AuthService(db_session).refresh(original_token)
    assert rotated.refresh_token != original_token
