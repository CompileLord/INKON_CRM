import asyncio
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.core.security import create_access_token, hash_password
from app.core.student_passwords import PendingStudentPasswordHasher
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.tests.conftest import TestingSessionLocal
from app.tests.migrations.test_migration_chain import DisposableMigrationDatabase
from app.tests.sms_test_support import SmsPasswordTestSupport

AUTH: str = "/api/v1/auth"
SEED_PASSWORD: str = "Uat-Pass-2026!"


class AuthApi:
    @staticmethod
    async def login(client: AsyncClient, identifier: str, password: str) -> Response:
        return await client.post(f"{AUTH}/login", json={"login": identifier, "password": password})

    @staticmethod
    async def refresh(client: AsyncClient, refresh_token: str) -> Response:
        return await client.post(f"{AUTH}/refresh", json={"refresh_token": refresh_token})

    @staticmethod
    def bearer(access_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {access_token}"}

    @staticmethod
    async def create_user(email: str, must_set_password: bool = False, password: str = SEED_PASSWORD) -> User:
        async with TestingSessionLocal() as session:
            user: User = User(
                email=email,
                password_hash=hash_password(password),
                first_name="U02",
                last_name="Tester",
                role=UserRole.MENTOR,
                must_set_password=must_set_password,
            )
            session.add(user)
            await session.commit()
            return user

    @staticmethod
    async def reset_code(email: str) -> str:
        raw: str | None = await redis_client.get(f"auth:reset:{email}")
        assert raw is not None
        return str(json.loads(raw)["code"])


@pytest.mark.asyncio
async def test_email_is_case_insensitive_for_login_creation_update_and_reset(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession,
) -> None:
    await AuthApi.create_user("Legacy.Mixed@Example.com")
    legacy_mixed: Response = await AuthApi.login(client, "legacy.mixed@example.com", SEED_PASSWORD)
    assert legacy_mixed.status_code == 200
    legacy_duplicate: Response = await client.post(
        "/api/v1/users/",
        json={"first_name": "Dup", "last_name": "Legacy", "role": "mentor", "email": "legacy.mixed@example.com"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert legacy_duplicate.status_code == 409
    login: Response = await AuthApi.login(client, "  MENTOR@Example.COM ", "mentor_pass123")
    assert login.status_code == 200
    legacy_login: Response = await client.post(
        f"{AUTH}/login", json={"email": "Mentor@EXAMPLE.com", "password": "mentor_pass123"},
    )
    assert legacy_login.status_code == 200

    duplicate: Response = await client.post(
        "/api/v1/users/",
        json={"first_name": "Dup", "last_name": "Mentor", "role": "mentor", "email": "MENTOR@example.com"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert duplicate.status_code == 409

    created: Response = await client.post(
        "/api/v1/users/",
        json={"first_name": "New", "last_name": "Mentor", "role": "mentor", "email": "  New.Mentor@Example.COM "},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert created.status_code == 201, created.text
    assert created.json()["email"] == "new.mentor@example.com"
    stored_email: str | None = (
        await db_session.execute(select(User.email).where(User.id == created.json()["id"]))
    ).scalar_one()
    assert stored_email == "new.mentor@example.com"

    update_conflict: Response = await client.patch(
        f"/api/v1/users/{test_student.id}",
        json={"email": "NEW.mentor@example.com"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert update_conflict.status_code == 409
    update_ok: Response = await client.patch(
        f"/api/v1/users/{test_student.id}",
        json={"email": "Student.Renamed@Example.COM"},
        headers=SmsPasswordTestSupport.bearer(test_admin),
    )
    assert update_ok.status_code == 200, update_ok.text
    assert update_ok.json()["email"] == "student.renamed@example.com"

    reset_request: Response = await client.post(f"{AUTH}/password-reset/request", json={"login": "MENTOR@Example.com"})
    assert reset_request.status_code == 200
    assert await AuthApi.reset_code("mentor@example.com")


@pytest.mark.asyncio
async def test_unique_index_rejects_live_emails_differing_only_by_case(db_session: AsyncSession) -> None:
    db_session.add(User(email="case.dup@example.com", first_name="A", last_name="B", role=UserRole.MENTOR))
    await db_session.flush()
    db_session.add(User(email="CASE.dup@example.com", first_name="A", last_name="B", role=UserRole.MENTOR))
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_migration_backfills_lowercase_skips_collisions_and_fails_loudly_on_live_collisions() -> None:
    backend_root: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    insert: str = (
        "INSERT INTO users (email, first_name, last_name, role, is_deleted) "
        "VALUES ($1, 'M', 'U', 'mentor', $2) RETURNING id"
    )
    async with DisposableMigrationDatabase(backend_root) as database:
        assert database.upgrade("wp69a_payment_idempotency").returncode == 0
        safe_id: int = await database.fetchval(insert, "Safe.Mixed@Example.com", False)
        deleted_id: int = await database.fetchval(insert, "Old.Case@example.com", True)
        live_id: int = await database.fetchval(insert, "old.case@EXAMPLE.com", False)
        await database.fetchval(insert, "Clash@example.com", False)
        await database.fetchval(insert, "CLASH@example.com", False)
        failed: subprocess.CompletedProcess[str] = database.upgrade("head")
        assert failed.returncode != 0
        assert "clash@example.com" in failed.stderr + failed.stdout
        assert await database.fetchval("SELECT email FROM users WHERE id = $1", safe_id) == "Safe.Mixed@Example.com"
        await database.execute("DELETE FROM users WHERE lower(email) = 'clash@example.com'")
        upgraded: subprocess.CompletedProcess[str] = database.upgrade("head")
        assert upgraded.returncode == 0, upgraded.stdout + upgraded.stderr
        assert await database.fetchval("SELECT email FROM users WHERE id = $1", safe_id) == "safe.mixed@example.com"
        assert await database.fetchval("SELECT email FROM users WHERE id = $1", deleted_id) == "Old.Case@example.com"
        assert await database.fetchval("SELECT email FROM users WHERE id = $1", live_id) == "old.case@EXAMPLE.com"
        assert await database.fetchval(
            "SELECT count(*) FROM pg_indexes WHERE indexname = 'ux_users_email_lower_live'"
        ) == 1
        assert await database.compare_models() == []


@pytest.mark.asyncio
async def test_wrong_current_password_returns_400_code_and_keeps_the_session(
    client: AsyncClient, test_student: User,
) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    access_token: str = login.json()["access_token"]
    rejected: Response = await client.post(
        f"{AUTH}/change-password",
        json={"current_password": "not-the-password1", "new_password": "Another-Pass-77"},
        headers=AuthApi.bearer(access_token),
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"]["code"] == "invalid_current_password"
    still_valid: Response = await client.get("/api/v1/users/me", headers=AuthApi.bearer(access_token))
    assert still_valid.status_code == 200


@pytest.mark.asyncio
async def test_parallel_refreshes_within_grace_all_succeed_and_stay_in_one_family(
    client: AsyncClient, test_student: User,
) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    original: str = login.json()["refresh_token"]
    responses: list[Response] = await asyncio.gather(*(AuthApi.refresh(client, original) for _ in range(4)))
    assert [response.status_code for response in responses] == [200, 200, 200, 200]
    successors: set[str] = {response.json()["refresh_token"] for response in responses}
    assert len(successors) == 4
    for successor in successors:
        assert (await AuthApi.refresh(client, successor)).status_code == 200
    async with TestingSessionLocal() as session:
        families: set[str | None] = set(
            (await session.execute(select(RefreshToken.family_id).where(RefreshToken.user_id == test_student.id))).scalars()
        )
    assert len(families) == 1 and None not in families


@pytest.mark.asyncio
async def test_reuse_after_grace_revokes_the_whole_family(client: AsyncClient, test_student: User) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    original: str = login.json()["refresh_token"]
    first: Response = await AuthApi.refresh(client, original)
    assert first.status_code == 200
    async with TestingSessionLocal() as session:
        await session.execute(
            text("UPDATE refresh_tokens SET rotated_at = :moment WHERE rotated_at IS NOT NULL"),
            {"moment": datetime.now(timezone.utc) - timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS + 60)},
        )
        await session.commit()
    replay: Response = await AuthApi.refresh(client, original)
    assert replay.status_code == 401
    assert (await AuthApi.refresh(client, first.json()["refresh_token"])).status_code == 401


@pytest.mark.asyncio
async def test_rotated_token_is_not_accepted_in_grace_after_password_change(
    client: AsyncClient, test_student: User,
) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    original: str = login.json()["refresh_token"]
    rotated: Response = await AuthApi.refresh(client, original)
    changed: Response = await client.post(
        f"{AUTH}/change-password",
        json={"current_password": "student_pass123", "new_password": "Changed-Pass-42"},
        headers=AuthApi.bearer(rotated.json()["access_token"]),
    )
    assert changed.status_code == 200
    assert (await AuthApi.refresh(client, original)).status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_the_presented_access_token_with_matching_ttl(
    client: AsyncClient, test_student: User,
) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    access_token: str = login.json()["access_token"]
    headers: dict[str, str] = AuthApi.bearer(access_token)
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200
    logout: Response = await client.post(
        f"{AUTH}/logout", json={"refresh_token": login.json()["refresh_token"]}, headers=headers,
    )
    assert logout.status_code == 204
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401
    keys: list[str] = [key async for key in _scan_keys("auth:denied_jti:*")]
    assert len(keys) == 1
    remaining: int = await redis_client.ttl(keys[0])
    assert 0 < remaining <= settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    other: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    assert (await client.get("/api/v1/users/me", headers=AuthApi.bearer(other.json()["access_token"]))).status_code == 200
    anonymous_logout: Response = await client.post(f"{AUTH}/logout", json={"refresh_token": other.json()["refresh_token"]})
    assert anonymous_logout.status_code == 204


async def _scan_keys(pattern: str) -> Any:
    cursor: int = 0
    while True:
        cursor, keys = await redis_client.scan(cursor=cursor, match=pattern)
        for key in keys:
            yield key
        if cursor == 0:
            return


@pytest.mark.asyncio
async def test_reset_clears_must_set_password_for_an_invited_user(client: AsyncClient) -> None:
    email: str = "invited.u02@example.com"
    await AuthApi.create_user(email, must_set_password=True, password="Temp-Invite-1")
    assert (await client.post(f"{AUTH}/password-reset/request", json={"login": email})).status_code == 200
    verified: Response = await client.post(
        f"{AUTH}/password-reset/verify", json={"email": email, "code": await AuthApi.reset_code(email)},
    )
    assert verified.status_code == 200
    confirmed: Response = await client.post(
        f"{AUTH}/password-reset/confirm",
        json={"reset_token": verified.json()["reset_token"], "new_password": "Fresh-Pass-2026"},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["must_set_password"] is False
    login: Response = await AuthApi.login(client, email, "Fresh-Pass-2026")
    assert login.status_code == 200 and login.json()["must_set_password"] is False


@pytest.mark.asyncio
async def test_reset_request_and_verify_responses_do_not_reveal_account_existence(
    client: AsyncClient, test_mentor: User,
) -> None:
    known: Response = await client.post(f"{AUTH}/password-reset/request", json={"login": test_mentor.email})
    unknown: Response = await client.post(f"{AUTH}/password-reset/request", json={"login": "nobody.u02@example.com"})
    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    wrong_known: Response = await client.post(
        f"{AUTH}/password-reset/verify", json={"email": test_mentor.email, "code": "000000"},
    )
    wrong_unknown: Response = await client.post(
        f"{AUTH}/password-reset/verify", json={"email": "nobody.u02@example.com", "code": "000000"},
    )
    assert wrong_known.status_code == wrong_unknown.status_code == 400
    assert wrong_known.json() == wrong_unknown.json()
    not_requested: Response = await client.post(
        f"{AUTH}/password-reset/verify", json={"email": "mentor.other@example.com", "code": "000000"},
    )
    assert not_requested.json() == wrong_known.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("weak_password", ["12345678", "Password1", "short1A", "passw0rd", "1234567890"])
async def test_weak_passwords_are_rejected_on_change_set_and_reset(
    client: AsyncClient, test_student: User, weak_password: str,
) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    changed: Response = await client.post(
        f"{AUTH}/change-password",
        json={"current_password": "student_pass123", "new_password": weak_password},
        headers=AuthApi.bearer(login.json()["access_token"]),
    )
    assert changed.status_code in (400, 422)
    setup_user: User = await AuthApi.create_user("setup.u02@example.com", must_set_password=True)
    setup_login: Response = await AuthApi.login(client, setup_user.email, SEED_PASSWORD)
    assert setup_login.json()["must_set_password"] is True
    set_response: Response = await client.post(
        f"{AUTH}/set-password",
        json={"new_password": weak_password},
        headers=AuthApi.bearer(setup_login.json()["access_token"]),
    )
    assert set_response.status_code in (400, 422)
    await client.post(f"{AUTH}/password-reset/request", json={"login": test_student.email})
    verified: Response = await client.post(
        f"{AUTH}/password-reset/verify", json={"email": test_student.email, "code": await AuthApi.reset_code(test_student.email)},
    )
    confirmed: Response = await client.post(
        f"{AUTH}/password-reset/confirm",
        json={"reset_token": verified.json()["reset_token"], "new_password": weak_password},
    )
    assert confirmed.status_code in (400, 422)


@pytest.mark.asyncio
async def test_seed_style_password_is_accepted_by_the_policy(client: AsyncClient, test_student: User) -> None:
    login: Response = await AuthApi.login(client, test_student.email, "student_pass123")
    changed: Response = await client.post(
        f"{AUTH}/change-password",
        json={"current_password": "student_pass123", "new_password": SEED_PASSWORD},
        headers=AuthApi.bearer(login.json()["access_token"]),
    )
    assert changed.status_code == 200
    assert (await AuthApi.login(client, test_student.email, SEED_PASSWORD)).status_code == 200


@pytest.mark.asyncio
async def test_sms_code_login_forces_a_real_password(
    client: AsyncClient, test_admin: User, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
    created: Response = await SmsPasswordTestSupport.create_student_via_api(
        client, test_admin, email=None, phone="+992900000771",
    )
    assert created.status_code == 201, created.text
    student_id: int = created.json()["id"]
    code: str = SmsPasswordTestSupport.read_code((await SmsPasswordTestSupport.sms_events(db_session, student_id))[0])
    initial: Response = await AuthApi.login(client, "+992900000771", code)
    assert initial.status_code == 200
    assert initial.json()["must_set_password"] is True

    reset_code: str = "A1B2C3"
    async with TestingSessionLocal() as session:
        stored: User = (await session.execute(select(User).where(User.id == student_id))).scalar_one()
        stored.must_set_password = False
        stored.pending_password_hash = PendingStudentPasswordHasher(settings.JWT_SECRET_KEY).hash(student_id, reset_code)
        stored.pending_password_expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
        await session.commit()
    pending_login: Response = await AuthApi.login(client, "+992900000771", reset_code)
    assert pending_login.status_code == 200
    assert pending_login.json()["must_set_password"] is True
