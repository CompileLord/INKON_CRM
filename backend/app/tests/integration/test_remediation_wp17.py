from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.models.user import User
from app.schemas.auth import TokenPair
from app.services.auth_service import AuthService
from app.services.auth_composition import AuthServiceComposition


def _create_password_reset_grant(
    subject: str | int,
    auth_version: Any | None,
    claim_overrides: dict[str, Any] | None = None,
    omitted_claims: tuple[str, ...] = (),
) -> str:
    issued_at: datetime = datetime.now(timezone.utc)
    claims: dict[str, Any] = {
        "sub": str(subject),
        "type": "password_reset",
        "exp": int((issued_at + timedelta(minutes=5)).timestamp()),
        "iat": int(issued_at.timestamp()),
    }
    if auth_version is not None:
        claims["auth_version"] = auth_version
    if claim_overrides is not None:
        claims.update(claim_overrides)
    for omitted_claim in omitted_claims:
        claims.pop(omitted_claim, None)
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")


def _token_claims(token: str, signing_key: str) -> dict[str, Any]:
    return jwt.decode(token, signing_key, algorithms=["HS256"])


@pytest.mark.asyncio
async def test_reset_is_single_use_and_invalidates_existing_access_and_refresh(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"},
    )
    assert login_response.status_code == 200
    old_pair: dict[str, Any] = login_response.json()
    old_access_claims: dict[str, Any] = _token_claims(old_pair["access_token"], settings.JWT_SECRET_KEY)
    assert old_access_claims["auth_version"] == 0
    old_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {old_pair['access_token']}"},
    )
    assert old_profile.status_code == 200

    reset_grant: str = _create_password_reset_grant(test_student.id, 0)
    new_pair: TokenPair = await AuthServiceComposition.create(db_session).password_reset_confirm(reset_grant, "RecoveredPass123")
    await db_session.commit()

    new_access_claims: dict[str, Any] = _token_claims(new_pair.access_token, settings.JWT_SECRET_KEY)
    assert new_access_claims["auth_version"] == 1
    recovered_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {new_pair.access_token}"},
    )
    assert recovered_profile.status_code == 200

    old_access_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {old_pair['access_token']}"},
    )
    old_refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_pair["refresh_token"]},
    )
    assert old_access_response.status_code == 401
    assert old_refresh_response.status_code == 401

    with pytest.raises(HTTPException) as replay_failure:
        await AuthServiceComposition.create(db_session).password_reset_confirm(reset_grant, "SecondRecovery123")
    assert replay_failure.value.status_code == 400
    await db_session.rollback()

    persisted_user: User | None = await db_session.get(User, test_student.id)
    assert persisted_user is not None
    assert persisted_user.auth_version == 1
    assert persisted_user.password_hash is not None
    assert await AuthServiceComposition.create(db_session).refresh(new_pair.refresh_token)


@pytest.mark.asyncio
async def test_access_and_reset_tokens_without_epoch_are_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    current_time: datetime = datetime.now(timezone.utc)
    legacy_access_claims: dict[str, Any] = {
        "sub": str(test_student.id),
        "role": test_student.role.value,
        "type": "access",
        "exp": int((current_time + timedelta(minutes=5)).timestamp()),
        "iat": int(current_time.timestamp()),
    }
    legacy_access_token: str = jwt.encode(
        legacy_access_claims,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    legacy_access_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {legacy_access_token}"},
    )
    assert legacy_access_response.status_code == 401

    original_password_hash: str | None = test_student.password_hash
    legacy_reset_grant: str = _create_password_reset_grant(test_student.id, None)
    with pytest.raises(HTTPException) as reset_failure:
        await AuthServiceComposition.create(db_session).password_reset_confirm(
            legacy_reset_grant,
            "LegacyGrantPass123",
        )
    assert reset_failure.value.status_code == 400
    await db_session.flush()
    assert test_student.password_hash == original_password_hash


@pytest.mark.parametrize(
    ("case_name", "subject", "auth_version", "claim_overrides", "omitted_claims"),
    [
        pytest.param("missing_subject", "", 0, {}, (), id="missing-subject"),
        pytest.param("email_subject", "student@example.com", 0, {}, (), id="email-subject"),
        pytest.param("zero_subject", "0", 0, {}, (), id="zero-subject"),
        pytest.param("negative_subject", "-1", 0, {}, (), id="negative-subject"),
        pytest.param("noncanonical_subject", "01", 0, {}, (), id="noncanonical-subject"),
        pytest.param("oversized_subject", "2147483648", 0, {}, (), id="oversized-subject"),
        pytest.param("missing_exp", "1", 0, {}, ("exp",), id="missing-exp"),
        pytest.param("missing_iat", "1", 0, {}, ("iat",), id="missing-iat"),
        pytest.param("boolean_exp", "1", 0, {"exp": True}, (), id="boolean-exp"),
        pytest.param("string_exp", "1", 0, {"exp": "1792065305"}, (), id="string-exp"),
        pytest.param("boolean_iat", "1", 0, {"iat": True}, (), id="boolean-iat"),
        pytest.param("string_iat", "1", 0, {"iat": "1792065005"}, (), id="string-iat"),
        pytest.param("expired", "1", 0, {"exp": 1_700_000_000}, (), id="expired"),
        pytest.param(
            "future_iat",
            "1",
            0,
            {},
            (),
            id="future-iat",
        ),
        pytest.param(
            "overlong_lifetime",
            "1",
            0,
            {},
            (),
            id="overlong-lifetime",
        ),
        pytest.param("boolean_epoch", "1", True, {}, (), id="boolean-epoch"),
        pytest.param("string_epoch", "1", "0", {}, (), id="string-epoch"),
        pytest.param("negative_epoch", "1", -1, {}, (), id="negative-epoch"),
        pytest.param(
            "wrong_purpose",
            "1",
            0,
            {"type": "access"},
            (),
            id="wrong-purpose",
        ),
    ],
)
@pytest.mark.asyncio
async def test_malformed_or_expired_reset_grants_do_not_mutate_users(
    case_name: str,
    subject: str,
    auth_version: Any,
    claim_overrides: dict[str, Any],
    omitted_claims: tuple[str, ...],
    db_session: AsyncSession,
    test_student: User,
) -> None:
    original_password_hash: str | None = test_student.password_hash
    original_auth_version: int = test_student.auth_version
    invalid_subject_cases: set[str] = {
        "missing_subject",
        "email_subject",
        "zero_subject",
        "negative_subject",
        "noncanonical_subject",
        "oversized_subject",
    }
    if case_name == "future_iat":
        issued_at: datetime = datetime.now(timezone.utc) + timedelta(minutes=1)
        claim_overrides = {
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(minutes=5)).timestamp()),
        }
    elif case_name == "overlong_lifetime":
        issued_at = datetime.now(timezone.utc)
        claim_overrides = {
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(minutes=5, seconds=1)).timestamp()),
        }
    reset_grant: str = _create_password_reset_grant(
        subject if case_name in invalid_subject_cases else test_student.id,
        auth_version,
        claim_overrides,
        omitted_claims,
    )

    with pytest.raises(HTTPException) as failure:
        await AuthServiceComposition.create(db_session).password_reset_confirm(
            reset_grant,
            f"RejectedGrant{case_name}123",
        )

    assert failure.value.status_code == 400
    await db_session.flush()
    assert test_student.password_hash == original_password_hash
    assert test_student.auth_version == original_auth_version
    await db_session.rollback()


@pytest.mark.asyncio
async def test_issued_reset_grant_remains_bound_to_user_after_email_reassignment(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
) -> None:
    original_student_email: str = test_student.email
    reset_key: str = f"auth:reset:{original_student_email}"
    await redis_client.set(reset_key, '{"code":"183746","attempts":0}', ex=600)
    reset_grant: str = await AuthServiceComposition.create(db_session).password_reset_verify(
        original_student_email,
        "183746",
    )
    grant_claims: dict[str, Any] = _token_claims(reset_grant, settings.JWT_SECRET_KEY)
    await db_session.commit()

    original_student_password_hash: str | None = test_student.password_hash
    original_admin_password_hash: str | None = test_admin.password_hash
    await db_session.execute(
        update(User)
        .where(User.id == test_student.id)
        .values(email="student-reassigned@example.com")
    )
    await db_session.execute(
        update(User).where(User.id == test_admin.id).values(email=original_student_email)
    )
    await db_session.commit()

    reset_pair: TokenPair = await AuthServiceComposition.create(db_session).password_reset_confirm(
        reset_grant,
        "StudentOnlyReset123",
    )
    await db_session.commit()

    persisted_student: User | None = await db_session.scalar(
        select(User).where(User.id == test_student.id)
    )
    persisted_admin: User | None = await db_session.scalar(
        select(User).where(User.id == test_admin.id)
    )
    assert persisted_student is not None
    assert persisted_student.password_hash != original_student_password_hash
    assert persisted_student.auth_version == 1
    assert persisted_admin is not None
    assert persisted_admin.password_hash == original_admin_password_hash
    assert persisted_admin.auth_version == 0
    assert grant_claims["sub"] == str(test_student.id)
    assert _token_claims(reset_pair.access_token, settings.JWT_SECRET_KEY)["sub"] == str(
        test_student.id
    )


@pytest.mark.asyncio
async def test_privileged_reset_revokes_prior_access_and_issues_epoch_bound_pair(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin.email, "password": "admin_pass123"},
    )
    assert login_response.status_code == 200
    previous_pair: dict[str, Any] = login_response.json()

    reset_key: str = f"auth:reset:{test_admin.email}"
    await redis_client.set(reset_key, '{"code":"473829","attempts":0}', ex=600)
    reset_grant: str = await AuthServiceComposition.create(db_session).password_reset_verify(
        test_admin.email,
        "473829",
    )
    issued_claims: dict[str, Any] = _token_claims(reset_grant, settings.JWT_SECRET_KEY)
    assert issued_claims["sub"] == str(test_admin.id)
    assert issued_claims["auth_version"] == 0
    await db_session.commit()

    new_pair: TokenPair = await AuthServiceComposition.create(db_session).password_reset_confirm(
        reset_grant,
        "PrivilegedReset123",
    )
    await db_session.commit()
    new_access_claims: dict[str, Any] = _token_claims(
        new_pair.access_token,
        settings.JWT_SECRET_KEY,
    )
    new_refresh_claims: dict[str, Any] = _token_claims(
        new_pair.refresh_token,
        settings.JWT_REFRESH_SECRET_KEY,
    )
    assert new_access_claims["sub"] == str(test_admin.id)
    assert new_access_claims["auth_version"] == 1
    assert new_refresh_claims["sub"] == str(test_admin.id)

    previous_access = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {previous_pair['access_token']}"},
    )
    previous_refresh = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": previous_pair["refresh_token"]},
    )
    assert previous_access.status_code == 401
    assert previous_refresh.status_code == 401
