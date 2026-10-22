from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.user import User, UserRole
from app.schemas.auth import TokenPair
from app.services.auth_service import AuthService
from app.core.deps import AuthServiceComposition


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "expected_role",
    [
        UserRole.STUDENT,
        UserRole.MENTOR,
        UserRole.SUPERADMIN,
    ],
)
async def test_setup_token_is_restricted_before_and_after_password_setup(
    client: AsyncClient,
    db_session: AsyncSession,
    expected_role: UserRole,
) -> None:
    user: User = User(
        email=f"setup-{expected_role.value}@example.com",
        password_hash=hash_password("BeforeSetup123"),
        first_name="Setup",
        last_name="Required",
        role=expected_role,
        must_set_password=False,
    )
    db_session.add(user)
    await db_session.commit()
    full_token: str = create_access_token(user.id, user.role)
    resource_paths: dict[UserRole, str] = {
        UserRole.STUDENT: "/api/v1/students/me/profile",
        UserRole.MENTOR: "/api/v1/students/",
        UserRole.SUPERADMIN: "/api/v1/audit-log/",
    }
    resource_path: str = resource_paths[expected_role]
    full_token_resource = await client.get(
        resource_path,
        headers={"Authorization": f"Bearer {full_token}"},
    )
    assert full_token_resource.status_code == 200
    await db_session.execute(
        update(User).where(User.id == user.id).values(must_set_password=True)
    )
    await db_session.commit()
    setup_token: str = create_access_token(
        user.id,
        user.role,
        scope="must_set_password",
    )
    setup_headers: dict[str, str] = {"Authorization": f"Bearer {setup_token}"}

    initial_profile = await client.get("/api/v1/users/me", headers=setup_headers)
    initial_resource = await client.get(resource_path, headers=setup_headers)

    assert initial_profile.status_code == 403
    assert initial_resource.status_code == 403
    password_response = await client.post(
        "/api/v1/auth/set-password",
        headers=setup_headers,
        json={"new_password": "SetupPass123"},
    )
    assert password_response.status_code == 200
    password_result: dict[str, Any] = password_response.json()
    assert password_result["must_set_password"] is False
    original_token_profile = await client.get("/api/v1/users/me", headers=setup_headers)
    original_token_resource = await client.get(resource_path, headers=setup_headers)
    assert original_token_profile.status_code == 403
    assert original_token_resource.status_code == 403
    new_headers: dict[str, str] = {
        "Authorization": f"Bearer {password_result['access_token']}"
    }
    new_token_profile = await client.get(
        "/api/v1/users/me",
        headers=new_headers,
    )
    new_token_resource = await client.get(resource_path, headers=new_headers)
    assert new_token_profile.status_code == 200
    assert new_token_resource.status_code == 200


@pytest.mark.asyncio
async def test_database_setup_requirement_rejects_full_token_and_setup_requires_setup_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(must_set_password=True)
    )
    await db_session.commit()
    full_token: str = create_access_token(test_student.id, test_student.role)
    full_headers: dict[str, str] = {"Authorization": f"Bearer {full_token}"}

    profile_response = await client.get("/api/v1/users/me", headers=full_headers)
    setup_response = await client.post(
        "/api/v1/auth/set-password",
        headers=full_headers,
        json={"new_password": "SetupPass123"},
    )

    assert profile_response.status_code == 403
    assert setup_response.status_code == 403


@pytest.mark.asyncio
async def test_password_reset_keeps_setup_required_access_token_restricted(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(must_set_password=True)
    )
    await db_session.commit()
    reset_token: str = jwt.encode(
        {
            "sub": str(test_student.id),
            "type": "password_reset",
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "auth_version": test_student.auth_version,
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    token_pair: TokenPair = await AuthServiceComposition.create(db_session).password_reset_confirm(
        reset_token,
        "ResetPass123",
    )
    await db_session.commit()
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token_pair.access_token}"},
    )

    assert token_pair.must_set_password is True
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_login_and_refresh_keep_setup_access_tokens_restricted(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(must_set_password=True)
    )
    await db_session.commit()
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"},
    )
    assert login_response.status_code == 200
    login_token: str = login_response.json()["access_token"]
    login_claims = jwt.decode(login_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    login_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {login_token}"},
    )

    refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_response.json()["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    refresh_token: str = refresh_response.json()["access_token"]
    refresh_claims = jwt.decode(refresh_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    refresh_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )

    assert login_claims["scope"] == "must_set_password"
    assert refresh_claims["scope"] == "must_set_password"
    assert login_profile.status_code == 403
    assert refresh_profile.status_code == 403


@pytest.mark.asyncio
async def test_valid_full_access_token_remains_valid(
    client: AsyncClient,
    test_student: User,
) -> None:
    token: str = create_access_token(test_student.id, test_student.role)

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == test_student.id
    legacy_token: str = jwt.encode(
        {
            "sub": str(test_student.id),
            "role": test_student.role.value,
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "auth_version": test_student.auth_version,
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

    legacy_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {legacy_token}"},
    )

    assert legacy_response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("claim_failure", "subject", "scope", "purpose"),
    [
        ("missing_subject", None, None, "access"),
        ("non_string_subject", 1, None, "access"),
        ("noncanonical_subject", "01", None, "access"),
        ("oversized_subject", "2147483648", None, "access"),
        ("zero_subject", "0", None, "access"),
        ("negative_subject", "-1", None, "access"),
        ("unicode_subject", "unicode", None, "access"),
        ("wrong_scope_type", "1", ["must_set_password"], "access"),
        ("unknown_scope", "1", "admin", "access"),
        ("reset_purpose", "1", None, "password_reset"),
        ("refresh_purpose", "1", None, "refresh"),
    ],
)
async def test_access_dependency_rejects_malformed_or_non_access_claims(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
    claim_failure: str,
    subject: Any,
    scope: Any,
    purpose: str,
) -> None:
    claims: dict[str, Any] = {
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "type": purpose,
    }
    if subject is not None:
        if subject == "1":
            claims["sub"] = str(test_student.id)
        elif subject == "01":
            claims["sub"] = f"0{test_student.id}"
        elif subject == "0":
            claims["sub"] = "0"
        elif subject == "-1":
            claims["sub"] = "-1"
        elif subject == "2147483648":
            claims["sub"] = "2147483648"
        elif subject == "unicode":
            claims["sub"] = str(test_student.id).translate(
                str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
            )
        else:
            claims["sub"] = subject
    if claim_failure in {"zero_subject", "negative_subject"}:
        await db_session.execute(
            update(User).where(User.id == test_student.id).values(id=int(subject))
        )
        await db_session.commit()
    if scope is not None:
        claims["scope"] = scope
    token: str = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401, claim_failure


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "time_failure",
    [
        "missing_expiration",
        "missing_issued_at",
        "noninteger_expiration",
        "noninteger_issued_at",
        "null_expiration",
        "null_issued_at",
        "list_expiration",
        "list_issued_at",
        "nonfinite_expiration",
        "nonfinite_issued_at",
        "expired",
        "excessive_lifetime",
        "future_issued_at",
    ],
)
async def test_access_dependency_rejects_missing_invalid_or_unbounded_time_claims(
    client: AsyncClient,
    test_student: User,
    time_failure: str,
) -> None:
    now: int = int(datetime.now(timezone.utc).timestamp())
    expiration: Any = now + 300
    issued_at: Any = now
    if time_failure == "missing_expiration":
        expiration = None
    elif time_failure == "missing_issued_at":
        issued_at = None
    elif time_failure == "noninteger_expiration":
        expiration = str(now + 300)
    elif time_failure == "noninteger_issued_at":
        issued_at = str(now)
    elif time_failure == "null_expiration":
        expiration = None
    elif time_failure == "null_issued_at":
        issued_at = None
    elif time_failure == "list_expiration":
        expiration = [now + 300]
    elif time_failure == "list_issued_at":
        issued_at = [now]
    elif time_failure == "nonfinite_expiration":
        expiration = float("inf")
    elif time_failure == "nonfinite_issued_at":
        issued_at = float("inf")
    elif time_failure == "expired":
        expiration = now - 1
        issued_at = now - 301
    elif time_failure == "excessive_lifetime":
        expiration = now + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 + 1
    elif time_failure == "future_issued_at":
        issued_at = now + 60
        expiration = issued_at + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    claims: dict[str, Any] = {"sub": str(test_student.id)}
    if time_failure != "missing_expiration":
        claims["exp"] = expiration
    if time_failure != "missing_issued_at":
        claims["iat"] = issued_at
    token: str = jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401, time_failure
