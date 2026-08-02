import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_get_org_settings(client: AsyncClient, test_student: User) -> None:
    token = create_access_token(test_student.id, test_student.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/v1/settings/org", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "org_name" in data
    assert "notify_payments" in data
    assert "notify_debts" in data


@pytest.mark.asyncio
async def test_update_org_settings_superadmin(client: AsyncClient, test_admin: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/settings/org",
        json={
            "org_name": "Новый ИМКОН",
            "notify_payments": False,
            "notify_debts": True
        },
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["org_name"] == "Новый ИМКОН"
    assert data["notify_payments"] is False
    assert data["notify_debts"] is True


@pytest.mark.asyncio
async def test_update_org_settings_forbidden(client: AsyncClient, test_mentor: User) -> None:
    token = create_access_token(test_mentor.id, test_mentor.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/settings/org",
        json={"org_name": "Hacked Name"},
        headers=headers
    )
    assert response.status_code == 403
