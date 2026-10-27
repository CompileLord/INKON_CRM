import pytest
from httpx import AsyncClient, Response
from sqlalchemy.engine import Result
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.audit_log import AuditLog
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


@pytest.mark.asyncio
async def test_organization_contact_settings_and_audit(
    client: AsyncClient, test_admin: User, db_session: AsyncSession
) -> None:
    token: str = create_access_token(test_admin.id, test_admin.role)
    headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
    initial: Response = await client.get("/api/v1/settings/org", headers=headers)
    assert initial.status_code == 200
    assert initial.json()["address"] is None
    assert initial.json()["phone"] is None
    updated: Response = await client.patch(
        "/api/v1/settings/org", headers=headers,
        json={"address": "Central street 12", "phone": "+992900000001"},
    )
    assert updated.status_code == 200
    assert updated.json()["address"] == "Central street 12"
    assert updated.json()["phone"] == "+992900000001"
    stored: Response = await client.get("/api/v1/settings/org", headers=headers)
    assert stored.json()["address"] == "Central street 12"
    assert stored.json()["phone"] == "+992900000001"
    audit_result: Result = await db_session.execute(
        select(AuditLog).where(AuditLog.entity_type == "settings", AuditLog.user_id == test_admin.id)
    )
    changes: dict[str, str | None] = {entry.field_name: entry.new_value for entry in audit_result.scalars()}
    assert changes["address"] == "Central street 12"
    assert changes["phone"] == "+992900000001"
    invalid: Response = await client.patch("/api/v1/settings/org", headers=headers, json={"phone": "992900000001"})
    assert invalid.status_code == 422
    cleared: Response = await client.patch("/api/v1/settings/org", headers=headers, json={"address": None, "phone": None})
    assert cleared.json()["address"] is None
    assert cleared.json()["phone"] is None
