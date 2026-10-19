from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User, UserRole


@pytest.mark.parametrize(
    ("payload", "attempted_field"),
    [
        ({"parent_phone": "+992900000002"}, "parent_phone"),
        ({"parent_phone": None}, "parent_phone"),
        ({"parent_telegram_chat_id": 902}, "parent_telegram_chat_id"),
        ({"parent_telegram_chat_id": None}, "parent_telegram_chat_id"),
    ],
    ids=["change-parent-phone", "clear-parent-phone", "replace-chat", "clear-chat"],
)
@pytest.mark.asyncio
async def test_student_cannot_change_guardian_destination_through_self_update(
    payload: dict[str, Any],
    attempted_field: str,
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    test_student.parent_phone = "+992900000001"
    test_student.parent_telegram_chat_id = 901
    db_session.add(test_student)
    await db_session.commit()
    headers: dict[str, str] = {
        "Authorization": f"Bearer {create_access_token(test_student.id, UserRole.STUDENT)}"
    }

    response = await client.patch(
        "/api/v1/users/me",
        headers=headers,
        json=payload,
    )

    assert response.status_code == 422
    assert attempted_field in payload
    await db_session.refresh(test_student)
    assert test_student.parent_phone == "+992900000001"
    assert test_student.parent_telegram_chat_id == 901


@pytest.mark.asyncio
async def test_admin_can_provision_and_phone_change_clears_stale_binding(
    client: AsyncClient,
    test_admin: User,
) -> None:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {create_access_token(test_admin.id, UserRole.SUPERADMIN)}"
    }
    create_response = await client.post(
        "/api/v1/users/",
        headers=headers,
        json={
            "email": "wp15-admin-provision@example.com",
            "first_name": "Provisioned",
            "last_name": "Student",
            "role": "student",
            "phone": "+992900000601",
            "parent_phone": "+992900000602",
            "parent_telegram_chat_id": 7401,
        },
    )
    assert create_response.status_code == 201
    student_id = create_response.json()["id"]
    assert create_response.json()["parent_phone"] == "+992900000602"
    assert create_response.json()["parent_telegram_chat_id"] == 7401

    change_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_phone": "+992900000603"},
    )
    assert change_response.status_code == 200
    assert change_response.json()["parent_phone"] == "+992900000603"
    assert change_response.json()["parent_telegram_chat_id"] is None

    reset_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_telegram_chat_id": 7402},
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["parent_telegram_chat_id"] == 7402

    clear_response = await client.patch(
        f"/api/v1/users/{student_id}",
        headers=headers,
        json={"parent_telegram_chat_id": None},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["parent_telegram_chat_id"] is None
