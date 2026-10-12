import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core import security
from app.models.user import User, UserRole
from app.models.refresh_token import RefreshToken


@pytest.fixture
def identity_user(request: pytest.FixtureRequest) -> User:
    return request.getfixturevalue(request.param)


@pytest.mark.asyncio
@pytest.mark.parametrize("identity_user,password", [
    ("test_admin", "admin_pass123"),
    ("test_mentor", "mentor_pass123"),
    ("test_student", "student_pass123"),
    ("test_accountant", "accountant_pass123"),
], indirect=["identity_user"])
async def test_login_and_refresh_preserve_canonical_subject_and_role(
    client: AsyncClient,
    identity_user: User,
    password: str,
) -> None:
    user: User = identity_user
    login = await client.post("/api/v1/auth/login", json={"email": user.email, "password": password})
    assert login.status_code == 200
    original = login.json()
    original_claims = jwt.decode(original["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
    assert original_claims["sub"] == str(user.id)
    assert original_claims["role"] == user.role.value
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": original["refresh_token"]})
    assert refreshed.status_code == 200
    refreshed_claims = jwt.decode(refreshed.json()["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
    assert refreshed_claims["sub"] == original_claims["sub"]
    assert refreshed_claims["role"] == original_claims["role"]
    assert refreshed.json()["must_set_password"] is False


@pytest.mark.asyncio
async def test_real_forced_session_retains_scope_until_successful_password_setup(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    student = await db_session.get(User, test_student.id)
    assert student is not None
    student.must_set_password = True
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"email": student.email, "password": "student_pass123"})
    assert login.status_code == 200
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": login.json()["refresh_token"]})
    assert refreshed.status_code == 200
    before = refreshed.json()
    claims = jwt.decode(before["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
    assert before["must_set_password"] is True
    assert claims["scope"] == "must_set_password"
    completed = await client.post("/api/v1/auth/set-password", json={"new_password": "isolatedFixture123"}, headers={"Authorization": f"Bearer {before['access_token']}"})
    assert completed.status_code == 200
    after = completed.json()
    after_claims = jwt.decode(after["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
    assert after["must_set_password"] is False
    assert "scope" not in after_claims
    assert after_claims["sub"] == claims["sub"]
    await db_session.refresh(student)
    assert student.must_set_password is False


@pytest.mark.asyncio
async def test_real_student_identity_keeps_other_profile_denied(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    other = User(email="other-identity@example.com", first_name="Other", last_name="Fixture", role=UserRole.STUDENT, must_set_password=False)
    db_session.add(other)
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"})
    assert login.status_code == 200
    authorization: dict[str, str] = {"Authorization": f"Bearer {login.json()['access_token']}"}
    own_profile = await client.get(f"/api/v1/students/{test_student.id}/profile", headers=authorization)
    assert own_profile.status_code == 200
    assert own_profile.json()["user"]["id"] == test_student.id
    other_profile = await client.get(f"/api/v1/students/{other.id}/profile", headers=authorization)
    assert other_profile.status_code == 403


@pytest.mark.asyncio
async def test_same_second_logins_and_rotations_keep_refresh_identity_isolated(
    client: AsyncClient,
    test_admin: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_time: datetime = datetime.now(timezone.utc).replace(microsecond=0)

    class FixedSecurityClock(datetime):
        @classmethod
        def now(cls, tz: timezone | None = None) -> datetime:
            return fixed_time if tz is not None else fixed_time.replace(tzinfo=None)

    monkeypatch.setattr(security, "datetime", FixedSecurityClock)
    student_login = await client.post("/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"})
    admin_login = await client.post("/api/v1/auth/login", json={"email": test_admin.email, "password": "admin_pass123"})
    assert student_login.status_code == admin_login.status_code == 200
    original_student_token: str = student_login.json()["refresh_token"]
    original_admin_token: str = admin_login.json()["refresh_token"]
    assert original_student_token != original_admin_token
    issued_tokens: set[str] = {original_student_token, original_admin_token}
    for identity, original_token in ((test_student, original_student_token), (test_admin, original_admin_token)):
        refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_token})
        assert refreshed.status_code == 200
        tokens = refreshed.json()
        claims = jwt.decode(tokens["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
        assert claims["sub"] == str(identity.id)
        assert claims["role"] == identity.role.value
        assert tokens["refresh_token"] not in issued_tokens
        issued_tokens.add(tokens["refresh_token"])
        replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_token})
        assert replay.status_code == 401
        rotated = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert rotated.status_code == 200
        rotated_claims = jwt.decode(rotated.json()["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
        assert rotated_claims["sub"] == str(identity.id)
        assert rotated.json()["refresh_token"] not in issued_tokens
        issued_tokens.add(rotated.json()["refresh_token"])


@pytest.mark.asyncio
async def test_ambiguous_legacy_refresh_token_is_denied_instead_of_selecting_an_identity(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
) -> None:
    login = await client.post("/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"})
    assert login.status_code == 200
    refresh_token: str = login.json()["refresh_token"]
    duplicate = RefreshToken(user_id=test_admin.id, token_hash=security.hash_token(refresh_token), expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    db_session.add(duplicate)
    await db_session.commit()
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 401
    assert "access_token" not in refreshed.json()
