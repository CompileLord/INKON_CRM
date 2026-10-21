from typing import Any

import pytest
from httpx import AsyncClient, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.user import User
from app.schemas.user import UserCreate, UserSelfUpdate, UserUpdate
from app.services.telegram_link_service import IssuedLinkCode, LinkOutcome, LinkResult, TelegramLinkService


class CanonicalInputFixture:
    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    def phone_payload(schema: type[UserCreate] | type[UserUpdate] | type[UserSelfUpdate], field: str, value: str | None) -> dict[str, Any]:
        payload: dict[str, Any] = {field: value}
        if schema is UserCreate:
            payload.update(email="canonical@example.com", first_name="Canonical", last_name="Input", role="student")
            alternate_field: str = "parent_phone" if field == "phone" else "phone"
            payload[alternate_field] = "+992900000003"
        return payload


@pytest.mark.parametrize(("schema", "field"), [
    (UserCreate, "phone"), (UserCreate, "parent_phone"),
    (UserUpdate, "phone"), (UserUpdate, "parent_phone"), (UserSelfUpdate, "phone"),
])
@pytest.mark.parametrize("value", ["+12", "+992900000001", "+123456789012345", None])
def test_all_phone_inputs_accept_only_canonical_values_or_null(
    schema: type[UserCreate] | type[UserUpdate] | type[UserSelfUpdate], field: str, value: str | None,
) -> None:
    parsed: UserCreate | UserUpdate | UserSelfUpdate = schema.model_validate(CanonicalInputFixture.phone_payload(schema, field, value))
    assert getattr(parsed, field) == value


@pytest.mark.parametrize(("schema", "field"), [
    (UserCreate, "phone"), (UserCreate, "parent_phone"),
    (UserUpdate, "phone"), (UserUpdate, "parent_phone"), (UserSelfUpdate, "phone"),
])
@pytest.mark.parametrize("value", [
    "992900000001", "12", "+1", "+1234567890123456", "+012", "", "+12 ", " +12",
    "+12\n", "+1-2", "+1 2", "++12", "+1٢", "+١٢", "+1２", "１２", "1+2",
])
def test_all_phone_inputs_reject_noncanonical_values(
    schema: type[UserCreate] | type[UserUpdate] | type[UserSelfUpdate], field: str, value: str,
) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate(CanonicalInputFixture.phone_payload(schema, field, value))


@pytest.mark.asyncio
async def test_unknown_settings_key_rejects_entire_update(
    client: AsyncClient, test_admin: User,
) -> None:
    headers: dict[str, str] = CanonicalInputFixture.headers(test_admin)
    before: Response = await client.get("/api/v1/settings/org", headers=headers)
    assert before.status_code == 200
    response: Response = await client.patch("/api/v1/settings/org", headers=headers, json={"org_name": "Must not persist", "notify_debt": False})
    assert response.status_code == 422
    after: Response = await client.get("/api/v1/settings/org", headers=headers)
    assert after.json() == before.json()


@pytest.mark.asyncio
async def test_known_settings_update_remains_supported(client: AsyncClient, test_admin: User) -> None:
    response: Response = await client.patch("/api/v1/settings/org", headers=CanonicalInputFixture.headers(test_admin), json={"org_name": "Canonical Center", "notify_debts": False})
    assert response.status_code == 200
    assert response.json()["org_name"] == "Canonical Center"
    assert response.json()["notify_debts"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("stored_phone", ["992900000001", "+992900000001"])
async def test_equivalent_legacy_parent_phone_preserves_linked_guardian(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, stored_phone: str,
) -> None:
    test_student.parent_phone = stored_phone
    test_student.parent_telegram_chat_id = 4901
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=CanonicalInputFixture.headers(test_admin), json={"parent_phone": "+992900000001"})
    assert response.status_code == 200
    assert response.json()["parent_phone"] == "+992900000001"
    assert response.json()["parent_telegram_chat_id"] == 4901
    await db_session.refresh(test_student)
    assert test_student.parent_telegram_chat_id == 4901


@pytest.mark.asyncio
@pytest.mark.parametrize("stored_phone", ["992900000001", "+992900000001", " 992900000001", "+99290٠000001", "malformed", None])
@pytest.mark.parametrize("new_phone", ["+992900000002", None])
async def test_changed_or_cleared_parent_phone_revokes_previous_guardian(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
    stored_phone: str | None, new_phone: str | None,
) -> None:
    test_student.parent_phone = stored_phone
    test_student.parent_telegram_chat_id = 4902
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=CanonicalInputFixture.headers(test_admin), json={"parent_phone": new_phone})
    assert response.status_code == 200
    assert response.json()["parent_phone"] == new_phone
    assert response.json()["parent_telegram_chat_id"] == (4902 if stored_phone is None and new_phone is None else None)


@pytest.mark.asyncio
async def test_omitted_phones_preserve_legacy_values_and_binding(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
) -> None:
    test_student.phone = "992900000001"
    test_student.parent_phone = "992900000002"
    test_student.parent_telegram_chat_id = 4903
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=CanonicalInputFixture.headers(test_admin), json={"first_name": "Changed"})
    assert response.status_code == 200
    assert response.json()["phone"] == "992900000001"
    assert response.json()["parent_phone"] == "992900000002"
    assert response.json()["parent_telegram_chat_id"] == 4903


@pytest.mark.asyncio
async def test_explicit_null_self_phone_clears_legacy_value(
    client: AsyncClient, db_session: AsyncSession, test_student: User,
) -> None:
    test_student.phone = "992900000001"
    test_student.parent_phone = "+992900000003"
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch("/api/v1/users/me", headers=CanonicalInputFixture.headers(test_student), json={"phone": None})
    assert response.status_code == 200
    assert response.json()["phone"] is None


@pytest.mark.asyncio
async def test_explicit_guardian_destination_replacement_remains_authorized(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User,
) -> None:
    test_student.parent_phone = "992900000001"
    test_student.parent_telegram_chat_id = 4904
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=CanonicalInputFixture.headers(test_admin), json={"parent_phone": "+992900000002", "parent_telegram_chat_id": 4905})
    assert response.status_code == 200
    assert response.json()["parent_telegram_chat_id"] == 4905


@pytest.mark.asyncio
@pytest.mark.parametrize("stored_phone", [" 992900000001", "992900000001 ", "+99290٠000001", "99290-0000001"])
async def test_invalid_legacy_phone_is_not_equivalent_after_lossy_cleanup(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, stored_phone: str,
) -> None:
    test_student.parent_phone = stored_phone
    test_student.parent_telegram_chat_id = 4906
    db_session.add(test_student)
    await db_session.commit()
    response: Response = await client.patch(f"/api/v1/users/{test_student.id}", headers=CanonicalInputFixture.headers(test_admin), json={"parent_phone": "+992900000001"})
    assert response.status_code == 200
    assert response.json()["parent_telegram_chat_id"] is None


@pytest.mark.asyncio
async def test_legacy_parent_phone_remains_usable_with_code_based_guardian_linking(
    db_session: AsyncSession, test_student: User,
) -> None:
    test_student.parent_phone = "992900000001"
    db_session.add(test_student)
    await db_session.commit()
    service: TelegramLinkService = TelegramLinkService(db_session)
    issued: IssuedLinkCode = await service.issue_code_for_student(test_student.id, None)
    await db_session.commit()
    result: LinkResult = await service.link_parent_chat(4907, issued.code)
    await db_session.commit()
    assert result.outcome is LinkOutcome.LINKED
    await db_session.refresh(test_student)
    assert test_student.parent_phone == "992900000001"
    assert test_student.parent_telegram_chat_id == 4907
