import pytest
from httpx import AsyncClient, Response

from app.core.build_info import BuildInfo, get_build_info
from app.main import app
from app.models.user import User, UserRole

VERSION_URL: str = "/api/v1/system/version"


async def login_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login: Response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_version_requires_authentication(client: AsyncClient) -> None:
    response: Response = await client.get(VERSION_URL)
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_version_rejects_invalid_token(client: AsyncClient) -> None:
    response: Response = await client.get(VERSION_URL, headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_does_not_expose_build_info(client: AsyncClient) -> None:
    response: Response = await client.get("/health")
    assert "commit_sha" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.MENTOR, UserRole.STUDENT, UserRole.ACCOUNTANT])
async def test_version_hides_build_details_for_non_superadmins(
    client: AsyncClient, test_student: User, test_mentor: User, test_accountant: User, role: UserRole
) -> None:
    users: dict[UserRole, tuple[User, str]] = {
        UserRole.STUDENT: (test_student, "student_pass123"),
        UserRole.MENTOR: (test_mentor, "mentor_pass123"),
        UserRole.ACCOUNTANT: (test_accountant, "accountant_pass123"),
    }
    user: User
    password: str
    user, password = users[role]
    app.dependency_overrides[get_build_info] = lambda: BuildInfo(
        version="1.2.3", commit_sha="abc1234", commit_message="feat: ship", built_at="2026-10-17T10:00:00Z"
    )
    try:
        headers: dict[str, str] = await login_headers(client, user.email, password)
        response: Response = await client.get(VERSION_URL, headers=headers)
        assert response.status_code == 200
        assert response.json() == {
            "version": "1.2.3",
            "commit_sha": None,
            "commit_message": None,
            "built_at": None,
        }
    finally:
        app.dependency_overrides.pop(get_build_info, None)


@pytest.mark.asyncio
async def test_version_returns_build_details_for_superadmin(client: AsyncClient, test_admin: User) -> None:
    app.dependency_overrides[get_build_info] = lambda: BuildInfo(
        version="1.2.3", commit_sha="abc1234", commit_message="feat: ship", built_at="2026-10-17T10:00:00Z"
    )
    try:
        headers: dict[str, str] = await login_headers(client, test_admin.email, "admin_pass123")
        response: Response = await client.get(VERSION_URL, headers=headers)
        assert response.status_code == 200
        assert response.json() == {
            "version": "1.2.3",
            "commit_sha": "abc1234",
            "commit_message": "feat: ship",
            "built_at": "2026-10-17T10:00:00Z",
        }
    finally:
        app.dependency_overrides.pop(get_build_info, None)


@pytest.mark.asyncio
async def test_version_defaults_when_build_variables_are_unset(client: AsyncClient, test_admin: User) -> None:
    app.dependency_overrides[get_build_info] = lambda: BuildInfo.from_environment({})
    try:
        headers: dict[str, str] = await login_headers(client, test_admin.email, "admin_pass123")
        response: Response = await client.get(VERSION_URL, headers=headers)
        assert response.json()["version"] == "dev"
        assert response.json()["commit_sha"] == "unknown"
        assert response.json()["commit_message"] == "unknown"
        assert response.json()["built_at"] == "unknown"
    finally:
        app.dependency_overrides.pop(get_build_info, None)


@pytest.mark.asyncio
async def test_version_reads_build_environment(client: AsyncClient, test_admin: User, monkeypatch: pytest.MonkeyPatch) -> None:
    values: dict[str, str] = {
        "BUILD_VERSION": "2.3.4", "BUILD_COMMIT_SHA": "abcdef", "BUILD_COMMIT_MESSAGE": "release",
        "BUILD_TIME": "2026-10-27T00:00:00Z",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    get_build_info.cache_clear()
    try:
        headers: dict[str, str] = await login_headers(client, test_admin.email, "admin_pass123")
        response: Response = await client.get(VERSION_URL, headers=headers)
        assert response.json() == {
            "version": values["BUILD_VERSION"], "commit_sha": values["BUILD_COMMIT_SHA"],
            "commit_message": values["BUILD_COMMIT_MESSAGE"], "built_at": values["BUILD_TIME"],
        }
    finally:
        get_build_info.cache_clear()
