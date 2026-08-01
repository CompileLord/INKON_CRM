import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.redis import redis_client
from app.core.security import create_access_token
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_student: User) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["must_set_password"] is False


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, test_student: User) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "wrong_password"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_verify_code_not_requested(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/verify-code",
        json={"email": "nonexistent@example.com", "code": "123456"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Verification code expired or not requested"


@pytest.mark.asyncio
async def test_verify_code_success(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User
) -> None:
    test_student.must_set_password = True
    await db_session.flush()

    email = test_student.email
    code = "987654"
    key = f"auth:code:{email}"
    data = {"code": code, "attempts": 0}
    await redis_client.set(key, json.dumps(data), ex=600)

    response = await client.post(
        "/api/v1/auth/verify-code",
        json={"email": email, "code": code}
    )
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    assert token_data["must_set_password"] is True

    # Cleanup
    await redis_client.delete(key)
