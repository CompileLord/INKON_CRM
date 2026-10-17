import pytest
from httpx import AsyncClient

from app.core.build_info import BuildInfo, get_build_info
from app.main import app
from app.models.user import User

VERSION_URL: str = "/api/v1/system/version"


async def login_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_version_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(VERSION_URL)
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_version_rejects_invalid_token(client: AsyncClient) -> None:
    response = await client.get(VERSION_URL, headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_does_not_expose_build_info(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert "commit_sha" not in response.text


@pytest.mark.asyncio
async def test_version_returns_build_info_for_any_authenticated_role(
    client: AsyncClient, test_student: User, test_mentor: User
) -> None:
    expected: BuildInfo = BuildInfo(
        version="1.2.3", commit_sha="abc1234", commit_message="feat: ship", built_at="2026-10-17T10:00:00Z"
    )
    app.dependency_overrides[get_build_info] = lambda: expected
    try:
        for user, password in ((test_student, "student_pass123"), (test_mentor, "mentor_pass123")):
            headers = await login_headers(client, user.email, password)
            response = await client.get(VERSION_URL, headers=headers)
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
async def test_version_defaults_when_build_variables_are_unset(client: AsyncClient, test_student: User) -> None:
    app.dependency_overrides[get_build_info] = lambda: BuildInfo.from_environment({})
    try:
        headers = await login_headers(client, test_student.email, "student_pass123")
        response = await client.get(VERSION_URL, headers=headers)
        assert response.json()["version"] == "dev"
        assert response.json()["commit_sha"] == "unknown"
    finally:
        app.dependency_overrides.pop(get_build_info, None)
