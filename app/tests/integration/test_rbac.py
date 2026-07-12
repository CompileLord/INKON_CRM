import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User, UserRole


@pytest.mark.asyncio
async def test_superadmin_creates_user(client: AsyncClient, test_admin: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "newuser@example.com",
            "first_name": "New",
            "last_name": "User",
            "role": "mentor",
            "phone": "+992931112233"
        },
        headers=headers
    )
    assert response.status_code == 201
    assert response.json()["email"] == "newuser@example.com"


@pytest.mark.asyncio
async def test_student_cannot_create_user(client: AsyncClient, test_student: User) -> None:
    token = create_access_token(test_student.id, test_student.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "another@example.com",
            "first_name": "Bad",
            "last_name": "Actor",
            "role": "student"
        },
        headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_student_views_own_profile(client: AsyncClient, test_student: User) -> None:
    token = create_access_token(test_student.id, test_student.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/v1/students/me/profile", headers=headers)
    assert response.status_code == 200
    assert response.json()["user"]["email"] == test_student.email


@pytest.mark.asyncio
async def test_student_cannot_view_other_student_profile(
    client: AsyncClient,
    test_student: User,
    db_session: AsyncSession
) -> None:
    other_student = User(
        email="otherstudent@example.com",
        first_name="Other",
        last_name="One",
        role=UserRole.STUDENT,
        must_set_password=False
    )
    db_session.add(other_student)
    await db_session.flush()

    token = create_access_token(test_student.id, test_student.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get(f"/api/v1/students/{other_student.id}/profile", headers=headers)
    assert response.status_code == 403
