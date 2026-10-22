from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_admin_explicit_null_clears_optional_fields_and_preserves_required_identity(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User
) -> None:
    test_student.phone = "+992900000001"
    test_student.date_of_birth = date(2000, 1, 1)
    test_student.parent_phone = "+992900000002"
    test_student.parent_telegram_chat_id = 12345
    test_student.payment_day_of_month = 15
    db_session.add(test_student)
    await db_session.commit()
    original_identity = (test_student.first_name, test_student.last_name, test_student.email)
    student_email: str | None = test_student.email
    test_student.email = None
    db_session.add(test_student)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/users/{test_student.id}",
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
        json={"phone": None, "date_of_birth": None, "parent_phone": None,
              "payment_day_of_month": None},
    )
    assert response.status_code == 422
    test_student.email = student_email
    db_session.add(test_student)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/users/{test_student.id}",
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
        json={"phone": None, "date_of_birth": None,
              "payment_day_of_month": None},
    )
    assert response.status_code == 200
    await db_session.refresh(test_student)
    for field in ("phone", "date_of_birth", "payment_day_of_month"):
        assert response.json()[field] is None
        assert getattr(test_student, field) is None
    assert test_student.parent_telegram_chat_id == 12345
    assert (test_student.first_name, test_student.last_name, test_student.email) == original_identity


@pytest.mark.asyncio
async def test_admin_omitted_optional_fields_remain_persisted(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User
) -> None:
    test_mentor.phone = "+992900000001"
    test_mentor.date_of_birth = date(2000, 1, 1)
    test_mentor.parent_phone = "+992900000002"
    test_mentor.parent_telegram_chat_id = 12345
    db_session.add(test_mentor)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/users/{test_mentor.id}",
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
        json={"first_name": "Changed"},
    )
    assert response.status_code == 200
    await db_session.refresh(test_mentor)
    assert test_mentor.first_name == "Changed"
    assert test_mentor.phone == "+992900000001"
    assert test_mentor.date_of_birth == date(2000, 1, 1)
    assert test_mentor.parent_phone == "+992900000002"
    assert test_mentor.parent_telegram_chat_id == 12345
    cleared = await client.patch(
        f"/api/v1/users/{test_mentor.id}",
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
        json={"phone": None, "date_of_birth": None},
    )
    assert cleared.status_code == 200
    await db_session.refresh(test_mentor)
    assert test_mentor.phone is None
    assert test_mentor.date_of_birth is None
    assert test_mentor.parent_phone == "+992900000002"
    assert test_mentor.parent_telegram_chat_id == 12345


@pytest.mark.asyncio
@pytest.mark.parametrize("fixture_name", ["test_admin", "test_mentor", "test_student", "test_accountant"])
async def test_self_explicit_null_clears_only_supplied_optional_fields(
    client: AsyncClient, db_session: AsyncSession, request: pytest.FixtureRequest, fixture_name: str,
    test_admin: User, test_mentor: User, test_student: User, test_accountant: User
) -> None:
    owner: User = request.getfixturevalue(fixture_name)
    owner.phone = "+992900000001"
    owner.date_of_birth = date(2000, 1, 1)
    owner.parent_phone = "+992900000002"
    owner.parent_telegram_chat_id = 12345
    db_session.add(owner)
    await db_session.commit()
    original_identity = (owner.first_name, owner.last_name, owner.email)
    headers = {"Authorization": f"Bearer {create_access_token(owner.id, owner.role)}"}
    response = await client.patch("/api/v1/users/me", headers=headers, json={"phone": None, "date_of_birth": None})
    assert response.status_code == 200
    await db_session.refresh(owner)
    assert owner.phone is None
    assert owner.date_of_birth is None
    assert owner.parent_phone == "+992900000002"
    assert owner.parent_telegram_chat_id == 12345
    assert (owner.first_name, owner.last_name, owner.email) == original_identity
    readback = await client.get("/api/v1/users/me", headers=headers)
    assert readback.status_code == 200
    assert readback.json()["phone"] is None
    assert readback.json()["date_of_birth"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("fixture_name", ["test_mentor", "test_student", "test_accountant"])
async def test_nullable_patch_does_not_allow_nonadmin_editing_another_account(
    client: AsyncClient, db_session: AsyncSession, request: pytest.FixtureRequest, fixture_name: str,
    test_admin: User, test_mentor: User, test_student: User, test_accountant: User
) -> None:
    actor: User = request.getfixturevalue(fixture_name)
    test_admin.phone = "+992900000001"
    db_session.add(test_admin)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/users/{test_admin.id}",
        headers={"Authorization": f"Bearer {create_access_token(actor.id, actor.role)}"}, json={"phone": None},
    )
    assert response.status_code == 403
    await db_session.refresh(test_admin)
    assert test_admin.phone == "+992900000001"


@pytest.mark.asyncio
async def test_nullable_payment_patch_retains_student_only_guard_without_partial_write(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User
) -> None:
    test_mentor.phone = "+992900000001"
    db_session.add(test_mentor)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/users/{test_mentor.id}",
        headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"},
        json={"payment_day_of_month": None, "phone": None},
    )
    assert response.status_code == 400
    await db_session.refresh(test_mentor)
    assert test_mentor.phone == "+992900000001"


@pytest.mark.asyncio
async def test_anonymous_nullable_patch_remains_denied(
    client: AsyncClient, db_session: AsyncSession, test_student: User
) -> None:
    test_student.phone = "+992900000001"
    db_session.add(test_student)
    await db_session.commit()
    response = await client.patch(f"/api/v1/users/{test_student.id}", json={"phone": None})
    assert response.status_code == 401
    await db_session.refresh(test_student)
    assert test_student.phone == "+992900000001"
