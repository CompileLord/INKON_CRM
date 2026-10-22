import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.login_identifier import LoginIdentifier, LoginIdentifierKind, LoginIdentifierParser
from app.models.user import User
from app.services.user_service import UserService
from app.tests.sms_test_support import SmsPasswordTestSupport


class LoginApi:
    @staticmethod
    async def post(client: AsyncClient, body: dict[str, str]) -> Response:
        return await client.post("/api/v1/auth/login", json=body)


class StaffApi:
    @staticmethod
    async def create(client: AsyncClient, admin: User, body: dict[str, str]) -> Response:
        return await client.post("/api/v1/users/", json=body, headers=SmsPasswordTestSupport.bearer(admin))


def test_parser_classifies_email_and_normalizes_phone_with_separators() -> None:
    assert LoginIdentifierParser.parse(" A@Example.com ") == LoginIdentifier(LoginIdentifierKind.EMAIL, "A@example.com")
    assert LoginIdentifierParser.parse("+992 (90) 000-0001") == LoginIdentifier(LoginIdentifierKind.PHONE, "+992900000001")
    assert LoginIdentifierParser.parse("992900000001") == LoginIdentifier(LoginIdentifierKind.PHONE, "+992900000001")


@pytest.mark.parametrize("raw_identifier", ["", "not-an-email@", "abc", "+0123"])
def test_parser_rejects_values_that_are_neither_email_nor_phone(raw_identifier: str) -> None:
    with pytest.raises(ValueError):
        LoginIdentifierParser.parse(raw_identifier)


@pytest.mark.asyncio
async def test_student_with_only_a_parent_phone_is_rejected_naming_both_fields(
    client: AsyncClient, test_admin: User
) -> None:
    response: Response = await StaffApi.create(client, test_admin, {
        "first_name": "P", "last_name": "Only", "role": "student", "parent_phone": "+992900000321",
    })
    assert response.status_code == 422
    message: str = str(response.json()["detail"])
    assert "email" in message and "phone" in message


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["mentor", "accountant", "superadmin"])
async def test_staff_roles_still_require_an_email(client: AsyncClient, test_admin: User, role: str) -> None:
    response: Response = await StaffApi.create(client, test_admin, {
        "first_name": "S", "last_name": "Taff", "role": role, "phone": "+992900000322",
    })
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("contacts", [{"email": "only.email@example.com"}, {"phone": "+992900000323"}])
async def test_student_with_own_email_or_own_phone_is_accepted(
    client: AsyncClient, test_admin: User, contacts: dict[str, str]
) -> None:
    response: Response = await StaffApi.create(client, test_admin, {
        "first_name": "O", "last_name": "K", "role": "student", **contacts,
    })
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_login_by_email_phone_and_legacy_email_body_all_succeed(client: AsyncClient, test_student: User) -> None:
    by_email: Response = await LoginApi.post(client, {"login": test_student.email, "password": "student_pass123"})
    by_phone: Response = await LoginApi.post(client, {"login": test_student.phone, "password": "student_pass123"})
    by_formatted_phone: Response = await LoginApi.post(client, {"login": "+992 90 000 0888", "password": "student_pass123"})
    legacy: Response = await LoginApi.post(client, {"email": test_student.email, "password": "student_pass123"})
    assert [by_email.status_code, by_phone.status_code, by_formatted_phone.status_code, legacy.status_code] == [200, 200, 200, 200]


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"password": "student_pass123"},
    {"login": "student@example.com", "email": "student@example.com", "password": "student_pass123"},
    {"login": "not a login", "password": "student_pass123"},
    {"login": "student@example.com", "password": "x", "unknown": "field"},
])
async def test_login_body_requires_exactly_one_valid_identifier(client: AsyncClient, body: dict[str, str]) -> None:
    assert (await LoginApi.post(client, body)).status_code == 422


@pytest.mark.asyncio
async def test_parent_phone_never_logs_in_and_error_is_identical_to_unknown_account(
    client: AsyncClient, test_student: User, db_session: AsyncSession
) -> None:
    test_student.parent_phone = "+992900000777"
    db_session.add(test_student)
    await db_session.commit()
    parent_attempt: Response = await LoginApi.post(client, {"login": "+992900000777", "password": "student_pass123"})
    unknown_attempt: Response = await LoginApi.post(client, {"login": "+992900000666", "password": "student_pass123"})
    wrong_password: Response = await LoginApi.post(client, {"login": test_student.phone, "password": "wrong-password-1"})
    assert parent_attempt.status_code == unknown_attempt.status_code == wrong_password.status_code == 401
    assert parent_attempt.json() == unknown_attempt.json() == wrong_password.json()


@pytest.mark.asyncio
async def test_lockout_is_keyed_by_normalized_phone_across_formats(client: AsyncClient, test_student: User) -> None:
    spellings: list[str] = ["+992900000888", "992900000888", "+992 90 000 0888", "+992-900-000-888", "(+992) 900000888"]
    for index in range(settings.AUTH_LOGIN_LOCKOUT_LIMIT):
        failed: Response = await LoginApi.post(client, {"login": spellings[index % len(spellings)], "password": f"wrong-{index}-x"})
        assert failed.status_code == 401
    locked: Response = await LoginApi.post(client, {"login": "+992900000888", "password": "student_pass123"})
    assert locked.status_code == 429


@pytest.mark.asyncio
async def test_create_with_taken_email_or_phone_returns_409(client: AsyncClient, test_admin: User, test_student: User) -> None:
    taken_email: Response = await StaffApi.create(client, test_admin, {
        "first_name": "D", "last_name": "Up", "role": "student", "email": test_student.email, "phone": "+992900000401",
    })
    taken_phone: Response = await StaffApi.create(client, test_admin, {
        "first_name": "D", "last_name": "Up", "role": "student", "email": "dup.phone@example.com", "phone": test_student.phone,
    })
    assert taken_email.status_code == 409
    assert taken_phone.status_code == 409


@pytest.mark.asyncio
async def test_parent_phone_may_be_shared_between_siblings(client: AsyncClient, test_admin: User) -> None:
    first: Response = await StaffApi.create(client, test_admin, {
        "first_name": "A", "last_name": "Sib", "role": "student", "phone": "+992900000411", "parent_phone": "+992900000410",
    })
    second: Response = await StaffApi.create(client, test_admin, {
        "first_name": "B", "last_name": "Sib", "role": "student", "phone": "+992900000412", "parent_phone": "+992900000410",
    })
    assert (first.status_code, second.status_code) == (201, 201)


@pytest.mark.asyncio
async def test_update_to_a_phone_or_email_owned_by_another_user_returns_409(
    client: AsyncClient, test_admin: User, test_student: User, test_mentor: User, db_session: AsyncSession
) -> None:
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    phone_conflict: Response = await client.patch(f"/api/v1/users/{test_mentor.id}", json={"phone": test_student.phone}, headers=headers)
    email_conflict: Response = await client.patch(f"/api/v1/users/{test_mentor.id}", json={"email": test_student.email}, headers=headers)
    own_phone_unchanged: Response = await client.patch(f"/api/v1/users/{test_student.id}", json={"phone": test_student.phone}, headers=headers)
    assert (phone_conflict.status_code, email_conflict.status_code, own_phone_unchanged.status_code) == (409, 409, 200)


@pytest.mark.asyncio
async def test_self_update_to_a_taken_phone_returns_409(client: AsyncClient, test_student: User, test_mentor: User) -> None:
    response: Response = await client.patch(
        "/api/v1/users/me", json={"phone": test_student.phone}, headers=SmsPasswordTestSupport.bearer(test_mentor)
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_phone_of_a_soft_deleted_user_can_be_reused(
    client: AsyncClient, test_admin: User, test_student: User
) -> None:
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    assert (await client.delete(f"/api/v1/users/{test_student.id}", headers=headers)).status_code == 204
    reused: Response = await StaffApi.create(client, test_admin, {
        "first_name": "R", "last_name": "Euse", "role": "student", "phone": test_student.phone,
    })
    assert reused.status_code == 201


@pytest.mark.asyncio
async def test_database_unique_index_maps_a_lost_race_to_409(
    client: AsyncClient, test_admin: User, test_student: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def pretend_phone_is_free(self: object, phone: str) -> None:
        return None

    monkeypatch.setattr("app.repositories.sqlalchemy.user_repository.SQLAlchemyUserRepository.get_by_phone", pretend_phone_is_free)
    response: Response = await StaffApi.create(client, test_admin, {
        "first_name": "R", "last_name": "Ace", "role": "student", "phone": test_student.phone,
    })
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_removing_a_students_email_requires_an_own_phone_and_is_forbidden_for_staff(
    client: AsyncClient, test_admin: User, test_student: User, test_mentor: User, db_session: AsyncSession
) -> None:
    headers: dict[str, str] = SmsPasswordTestSupport.bearer(test_admin)
    mentor_removal: Response = await client.patch(f"/api/v1/users/{test_mentor.id}", json={"email": None}, headers=headers)
    allowed: Response = await client.patch(f"/api/v1/users/{test_student.id}", json={"email": None}, headers=headers)
    assert mentor_removal.status_code == 422
    assert allowed.status_code == 200 and allowed.json()["email"] is None
    phone_removal: Response = await client.patch(f"/api/v1/users/{test_student.id}", json={"phone": None}, headers=headers)
    assert phone_removal.status_code == 422
    stored: User = (await db_session.execute(select(User).where(User.id == test_student.id))).scalar_one()
    assert stored.phone == "+992900000888"


@pytest.mark.asyncio
async def test_user_service_lookup_by_phone_ignores_soft_deleted_users(db_session: AsyncSession, test_student: User) -> None:
    service: UserService = UserService(db_session)
    assert (await service.user_repo.get_by_phone(test_student.phone)) is not None
    await service.user_repo.soft_delete(test_student.id)
    assert (await service.user_repo.get_by_phone(test_student.phone)) is None


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
