import asyncio
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any
from uuid import uuid4

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from jose import jwt
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import event, select, text, update
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.util.concurrency import await_only

from app.core.config import settings
from app.core.redis import redis_client
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.services.auth_service import AuthService


def _create_password_reset_grant(
    subject: str | int,
    auth_version: Any | None,
    claim_overrides: dict[str, Any] | None = None,
    omitted_claims: tuple[str, ...] = (),
) -> str:
    issued_at: datetime = datetime.now(timezone.utc)
    claims: dict[str, Any] = {
        "sub": str(subject),
        "type": "password_reset",
        "exp": int((issued_at + timedelta(minutes=5)).timestamp()),
        "iat": int(issued_at.timestamp()),
    }
    if auth_version is not None:
        claims["auth_version"] = auth_version
    if claim_overrides is not None:
        claims.update(claim_overrides)
    for omitted_claim in omitted_claims:
        claims.pop(omitted_claim, None)
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm="HS256")


def _token_claims(token: str, signing_key: str) -> dict[str, Any]:
    return jwt.decode(token, signing_key, algorithms=["HS256"])


@pytest.mark.asyncio
async def test_reset_is_single_use_and_invalidates_existing_access_and_refresh(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"},
    )
    assert login_response.status_code == 200
    old_pair: dict[str, Any] = login_response.json()
    old_access_claims: dict[str, Any] = _token_claims(old_pair["access_token"], settings.JWT_SECRET_KEY)
    assert old_access_claims["auth_version"] == 0
    old_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {old_pair['access_token']}"},
    )
    assert old_profile.status_code == 200

    reset_grant: str = _create_password_reset_grant(test_student.id, 0)
    new_pair = await AuthService(db_session).password_reset_confirm(reset_grant, "RecoveredPass123")
    await db_session.commit()

    new_access_claims: dict[str, Any] = _token_claims(new_pair.access_token, settings.JWT_SECRET_KEY)
    assert new_access_claims["auth_version"] == 1
    recovered_profile = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {new_pair.access_token}"},
    )
    assert recovered_profile.status_code == 200

    old_access_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {old_pair['access_token']}"},
    )
    old_refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_pair["refresh_token"]},
    )
    assert old_access_response.status_code == 401
    assert old_refresh_response.status_code == 401

    with pytest.raises(HTTPException) as replay_failure:
        await AuthService(db_session).password_reset_confirm(reset_grant, "SecondRecovery123")
    assert replay_failure.value.status_code == 400
    await db_session.rollback()

    persisted_user: User | None = await db_session.get(User, test_student.id)
    assert persisted_user is not None
    assert persisted_user.auth_version == 1
    assert persisted_user.password_hash is not None
    assert await AuthService(db_session).refresh(new_pair.refresh_token)


@pytest.mark.asyncio
async def test_access_and_reset_tokens_without_epoch_are_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    current_time: datetime = datetime.now(timezone.utc)
    legacy_access_claims: dict[str, Any] = {
        "sub": str(test_student.id),
        "role": test_student.role.value,
        "type": "access",
        "exp": int((current_time + timedelta(minutes=5)).timestamp()),
        "iat": int(current_time.timestamp()),
    }
    legacy_access_token: str = jwt.encode(
        legacy_access_claims,
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    legacy_access_response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {legacy_access_token}"},
    )
    assert legacy_access_response.status_code == 401

    original_password_hash: str | None = test_student.password_hash
    legacy_reset_grant: str = _create_password_reset_grant(test_student.id, None)
    with pytest.raises(HTTPException) as reset_failure:
        await AuthService(db_session).password_reset_confirm(
            legacy_reset_grant,
            "LegacyGrantPass123",
        )
    assert reset_failure.value.status_code == 400
    await db_session.flush()
    assert test_student.password_hash == original_password_hash


@pytest.mark.parametrize(
    ("case_name", "subject", "auth_version", "claim_overrides", "omitted_claims"),
    [
        pytest.param("missing_subject", "", 0, {}, (), id="missing-subject"),
        pytest.param("email_subject", "student@example.com", 0, {}, (), id="email-subject"),
        pytest.param("zero_subject", "0", 0, {}, (), id="zero-subject"),
        pytest.param("negative_subject", "-1", 0, {}, (), id="negative-subject"),
        pytest.param("noncanonical_subject", "01", 0, {}, (), id="noncanonical-subject"),
        pytest.param("oversized_subject", "2147483648", 0, {}, (), id="oversized-subject"),
        pytest.param("missing_exp", "1", 0, {}, ("exp",), id="missing-exp"),
        pytest.param("missing_iat", "1", 0, {}, ("iat",), id="missing-iat"),
        pytest.param("boolean_exp", "1", 0, {"exp": True}, (), id="boolean-exp"),
        pytest.param("string_exp", "1", 0, {"exp": "1792065305"}, (), id="string-exp"),
        pytest.param("boolean_iat", "1", 0, {"iat": True}, (), id="boolean-iat"),
        pytest.param("string_iat", "1", 0, {"iat": "1792065005"}, (), id="string-iat"),
        pytest.param("expired", "1", 0, {"exp": 1_700_000_000}, (), id="expired"),
        pytest.param(
            "future_iat",
            "1",
            0,
            {},
            (),
            id="future-iat",
        ),
        pytest.param(
            "overlong_lifetime",
            "1",
            0,
            {},
            (),
            id="overlong-lifetime",
        ),
        pytest.param("boolean_epoch", "1", True, {}, (), id="boolean-epoch"),
        pytest.param("string_epoch", "1", "0", {}, (), id="string-epoch"),
        pytest.param("negative_epoch", "1", -1, {}, (), id="negative-epoch"),
        pytest.param(
            "wrong_purpose",
            "1",
            0,
            {"type": "access"},
            (),
            id="wrong-purpose",
        ),
    ],
)
@pytest.mark.asyncio
async def test_malformed_or_expired_reset_grants_do_not_mutate_users(
    case_name: str,
    subject: str,
    auth_version: Any,
    claim_overrides: dict[str, Any],
    omitted_claims: tuple[str, ...],
    db_session: AsyncSession,
    test_student: User,
) -> None:
    original_password_hash: str | None = test_student.password_hash
    original_auth_version: int = test_student.auth_version
    invalid_subject_cases: set[str] = {
        "missing_subject",
        "email_subject",
        "zero_subject",
        "negative_subject",
        "noncanonical_subject",
        "oversized_subject",
    }
    if case_name == "future_iat":
        issued_at: datetime = datetime.now(timezone.utc) + timedelta(minutes=1)
        claim_overrides = {
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(minutes=5)).timestamp()),
        }
    elif case_name == "overlong_lifetime":
        issued_at = datetime.now(timezone.utc)
        claim_overrides = {
            "iat": int(issued_at.timestamp()),
            "exp": int((issued_at + timedelta(minutes=5, seconds=1)).timestamp()),
        }
    reset_grant: str = _create_password_reset_grant(
        subject if case_name in invalid_subject_cases else test_student.id,
        auth_version,
        claim_overrides,
        omitted_claims,
    )

    with pytest.raises(HTTPException) as failure:
        await AuthService(db_session).password_reset_confirm(
            reset_grant,
            f"RejectedGrant{case_name}123",
        )

    assert failure.value.status_code == 400
    await db_session.flush()
    assert test_student.password_hash == original_password_hash
    assert test_student.auth_version == original_auth_version
    await db_session.rollback()


@pytest.mark.asyncio
async def test_issued_reset_grant_remains_bound_to_user_after_email_reassignment(
    db_session: AsyncSession,
    test_student: User,
    test_admin: User,
) -> None:
    original_student_email: str = test_student.email
    reset_key: str = f"auth:reset:{original_student_email}"
    await redis_client.set(reset_key, '{"code":"183746","attempts":0}', ex=600)
    reset_grant: str = await AuthService(db_session).password_reset_verify(
        original_student_email,
        "183746",
    )
    grant_claims: dict[str, Any] = _token_claims(reset_grant, settings.JWT_SECRET_KEY)
    await db_session.commit()

    original_student_password_hash: str | None = test_student.password_hash
    original_admin_password_hash: str | None = test_admin.password_hash
    await db_session.execute(
        update(User)
        .where(User.id == test_student.id)
        .values(email="student-reassigned@example.com")
    )
    await db_session.execute(
        update(User).where(User.id == test_admin.id).values(email=original_student_email)
    )
    await db_session.commit()

    reset_pair = await AuthService(db_session).password_reset_confirm(
        reset_grant,
        "StudentOnlyReset123",
    )
    await db_session.commit()

    persisted_student: User | None = await db_session.scalar(
        select(User).where(User.id == test_student.id)
    )
    persisted_admin: User | None = await db_session.scalar(
        select(User).where(User.id == test_admin.id)
    )
    assert persisted_student is not None
    assert persisted_student.password_hash != original_student_password_hash
    assert persisted_student.auth_version == 1
    assert persisted_admin is not None
    assert persisted_admin.password_hash == original_admin_password_hash
    assert persisted_admin.auth_version == 0
    assert grant_claims["sub"] == str(test_student.id)
    assert _token_claims(reset_pair.access_token, settings.JWT_SECRET_KEY)["sub"] == str(
        test_student.id
    )


@pytest.mark.asyncio
async def test_privileged_reset_revokes_prior_access_and_issues_epoch_bound_pair(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_admin.email, "password": "admin_pass123"},
    )
    assert login_response.status_code == 200
    previous_pair: dict[str, Any] = login_response.json()

    reset_key: str = f"auth:reset:{test_admin.email}"
    await redis_client.set(reset_key, '{"code":"473829","attempts":0}', ex=600)
    reset_grant: str = await AuthService(db_session).password_reset_verify(
        test_admin.email,
        "473829",
    )
    issued_claims: dict[str, Any] = _token_claims(reset_grant, settings.JWT_SECRET_KEY)
    assert issued_claims["sub"] == str(test_admin.id)
    assert issued_claims["auth_version"] == 0
    await db_session.commit()

    new_pair = await AuthService(db_session).password_reset_confirm(
        reset_grant,
        "PrivilegedReset123",
    )
    await db_session.commit()
    new_access_claims: dict[str, Any] = _token_claims(
        new_pair.access_token,
        settings.JWT_SECRET_KEY,
    )
    new_refresh_claims: dict[str, Any] = _token_claims(
        new_pair.refresh_token,
        settings.JWT_REFRESH_SECRET_KEY,
    )
    assert new_access_claims["sub"] == str(test_admin.id)
    assert new_access_claims["auth_version"] == 1
    assert new_refresh_claims["sub"] == str(test_admin.id)

    previous_access = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {previous_pair['access_token']}"},
    )
    previous_refresh = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": previous_pair["refresh_token"]},
    )
    assert previous_access.status_code == 401
    assert previous_refresh.status_code == 401


@pytest.mark.asyncio
async def test_reset_verification_and_password_setup_issue_versioned_scoped_access(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
) -> None:
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(must_set_password=True)
    )
    await db_session.commit()
    verification_code: str = "918273"
    verification_key: str = f"auth:code:{test_student.email}"
    await redis_client.set(
        verification_key,
        '{"code":"918273","attempts":0}',
        ex=600,
    )

    setup_pair = await AuthService(db_session).verify_code(test_student.email, verification_code)
    setup_claims: dict[str, Any] = _token_claims(setup_pair.access_token, settings.JWT_SECRET_KEY)
    assert setup_claims["auth_version"] == 0
    assert setup_claims["scope"] == "must_set_password"
    await db_session.commit()
    await redis_client.delete(verification_key)

    setup_response = await client.post(
        "/api/v1/auth/set-password",
        headers={"Authorization": f"Bearer {setup_pair.access_token}"},
        json={"new_password": "InitialPass123"},
    )
    assert setup_response.status_code == 200
    first_password_pair: dict[str, Any] = setup_response.json()
    setup_access_after_password_change = await client.post(
        "/api/v1/auth/set-password",
        headers={"Authorization": f"Bearer {setup_pair.access_token}"},
        json={"new_password": "StaleSetupPass123"},
    )
    assert setup_access_after_password_change.status_code == 401
    first_password_claims: dict[str, Any] = _token_claims(
        first_password_pair["access_token"],
        settings.JWT_SECRET_KEY,
    )
    assert first_password_claims["auth_version"] == 1
    assert "scope" not in first_password_claims

    current_login = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "InitialPass123"},
    )
    assert current_login.status_code == 200
    current_access_claims: dict[str, Any] = _token_claims(
        current_login.json()["access_token"],
        settings.JWT_SECRET_KEY,
    )
    current_refresh_claims: dict[str, Any] = _token_claims(
        current_login.json()["refresh_token"],
        settings.JWT_REFRESH_SECRET_KEY,
    )
    assert current_access_claims["auth_version"] == 1
    assert current_refresh_claims["sub"] == str(test_student.id)


@pytest.mark.asyncio
async def test_login_issues_epoch_bound_access_for_each_role(
    client: AsyncClient,
    test_admin: User,
    test_mentor: User,
    test_student: User,
) -> None:
    role_credentials: list[tuple[User, str]] = [
        (test_admin, "admin_pass123"),
        (test_mentor, "mentor_pass123"),
        (test_student, "student_pass123"),
    ]
    for user, password in role_credentials:
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": password},
        )
        assert response.status_code == 200
        claims: dict[str, Any] = _token_claims(response.json()["access_token"], settings.JWT_SECRET_KEY)
        assert claims["sub"] == str(user.id)
        assert claims["role"] == user.role.value
        assert claims["auth_version"] == 0


@pytest.mark.asyncio
async def test_password_reset_verification_embeds_current_auth_version(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    reset_code: str = "827364"
    reset_key: str = f"auth:reset:{test_student.email}"
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(auth_version=4)
    )
    await db_session.commit()
    await redis_client.set(reset_key, '{"code":"827364","attempts":0}', ex=600)

    reset_grant: str = await AuthService(db_session).password_reset_verify(
        test_student.email,
        reset_code,
    )
    reset_claims: dict[str, Any] = _token_claims(reset_grant, settings.JWT_SECRET_KEY)
    assert reset_claims["sub"] == str(test_student.id)
    assert reset_claims["type"] == "password_reset"
    assert reset_claims["auth_version"] == 4
    reset_pair = await AuthService(db_session).password_reset_confirm(
        reset_grant,
        "NonzeroEpochReset123",
    )
    assert _token_claims(reset_pair.access_token, settings.JWT_SECRET_KEY)["auth_version"] == 5
    await db_session.rollback()
    await redis_client.delete(reset_key)


@pytest.mark.asyncio
async def test_setup_required_reset_keeps_setup_scope_in_new_epoch(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    await db_session.execute(
        update(User).where(User.id == test_student.id).values(must_set_password=True)
    )
    await db_session.commit()
    grant: str = _create_password_reset_grant(test_student.id, 0)
    result = await AuthService(db_session).password_reset_confirm(grant, "SetupResetPass123")
    claims: dict[str, Any] = _token_claims(result.access_token, settings.JWT_SECRET_KEY)
    assert result.must_set_password is True
    assert claims["auth_version"] == 1
    assert claims["scope"] == "must_set_password"


@pytest.mark.asyncio
async def test_reset_confirmation_rollback_preserves_grant_and_refresh_state(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    original_password_hash: str | None = test_student.password_hash
    login_result = await AuthService(db_session).login(test_student.email, "student_pass123")
    await db_session.commit()
    reset_grant: str = _create_password_reset_grant(test_student.id, 0)

    await AuthService(db_session).password_reset_confirm(reset_grant, "RolledBackPass123")
    await db_session.rollback()

    rolled_back_user: User | None = await db_session.get(User, test_student.id)
    assert rolled_back_user is not None
    assert rolled_back_user.auth_version == 0
    assert rolled_back_user.password_hash == original_password_hash
    refreshed_pair = await AuthService(db_session).refresh(login_result.refresh_token)
    await db_session.commit()
    assert refreshed_pair.refresh_token != login_result.refresh_token

    second_confirmation = await AuthService(db_session).password_reset_confirm(
        reset_grant,
        "CommittedAfterRollback123",
    )
    await db_session.commit()
    assert _token_claims(second_confirmation.access_token, settings.JWT_SECRET_KEY)["auth_version"] == 1


@pytest.mark.asyncio
async def test_concurrent_reset_confirmations_have_one_winner(
    db_session: AsyncSession,
    test_student: User,
) -> None:
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        db_session.bind,
        expire_on_commit=False,
    )
    reset_grant: str = _create_password_reset_grant(test_student.id, 0)
    start_barrier: asyncio.Barrier = asyncio.Barrier(2)

    async def confirm_reset(password: str) -> bool:
        async with session_factory() as session:
            await start_barrier.wait()
            try:
                await AuthService(session).password_reset_confirm(reset_grant, password)
                await session.commit()
                return True
            except HTTPException as failure:
                await session.rollback()
                assert failure.status_code == 400
                return False

    outcomes: list[bool] = await asyncio.wait_for(
        asyncio.gather(
            confirm_reset("ConcurrentResetOne123"),
            confirm_reset("ConcurrentResetTwo123"),
        ),
        timeout=10,
    )
    assert sum(outcomes) == 1
    persisted_user: User | None = await db_session.scalar(
        select(User).where(User.id == test_student.id)
    )
    assert persisted_user is not None
    assert persisted_user.auth_version == 1


@pytest.mark.asyncio
async def test_refresh_waits_for_reset_user_lock_before_consuming_token(
    test_student: User,
) -> None:
    async with AsyncSessionLocal() as login_session:
        login_pair = await AuthService(login_session).login(
            test_student.email,
            "student_pass123",
        )
        await login_session.commit()

    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        AsyncSessionLocal.kw.get("bind"),
        expire_on_commit=False,
    )
    reset_grant: str = _create_password_reset_grant(test_student.id, 0)
    refresh_started: asyncio.Event = asyncio.Event()

    async def attempt_refresh() -> int:
        async with session_factory() as refresh_session:
            refresh_started.set()
            try:
                await AuthService(refresh_session).refresh(login_pair.refresh_token)
                await refresh_session.commit()
                return 200
            except HTTPException as failure:
                await refresh_session.rollback()
                return failure.status_code

    async with AsyncSessionLocal() as reset_session:
        await reset_session.begin()
        await reset_session.execute(
            select(User.id).where(User.id == test_student.id).with_for_update()
        )
        refresh_task: asyncio.Task[int] = asyncio.create_task(attempt_refresh())
        try:
            await asyncio.wait_for(refresh_started.wait(), timeout=2)
            try:
                early_result: int = await asyncio.wait_for(
                    asyncio.shield(refresh_task),
                    timeout=0.2,
                )
            except TimeoutError:
                early_result = 0
            assert early_result == 0

            reset_pair = await AuthService(reset_session).password_reset_confirm(
                reset_grant,
                "ResetLocksRefresh123",
            )
            await reset_session.commit()
            assert _token_claims(reset_pair.access_token, settings.JWT_SECRET_KEY)["auth_version"] == 1
            refresh_status: int = await asyncio.wait_for(refresh_task, timeout=5)
            assert refresh_status == 401
        finally:
            if not refresh_task.done():
                refresh_task.cancel()
                await asyncio.gather(refresh_task, return_exceptions=True)
            if reset_session.in_transaction():
                await reset_session.rollback()


@pytest.mark.asyncio
async def test_login_waits_for_reset_lock_and_cannot_use_old_password_after_reset(
    test_student: User,
) -> None:
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        AsyncSessionLocal.kw.get("bind"),
        expire_on_commit=False,
    )
    reset_grant: str = _create_password_reset_grant(test_student.id, 0)
    login_started: asyncio.Event = asyncio.Event()

    async def attempt_old_password_login() -> int:
        async with session_factory() as login_session:
            login_started.set()
            try:
                await AuthService(login_session).login(test_student.email, "student_pass123")
                await login_session.commit()
                return 200
            except HTTPException as failure:
                await login_session.rollback()
                return failure.status_code

    async with AsyncSessionLocal() as reset_session:
        await reset_session.begin()
        await reset_session.execute(
            select(User.id).where(User.id == test_student.id).with_for_update()
        )
        login_task: asyncio.Task[int] = asyncio.create_task(attempt_old_password_login())
        try:
            await asyncio.wait_for(login_started.wait(), timeout=2)
            try:
                early_result: int = await asyncio.wait_for(
                    asyncio.shield(login_task),
                    timeout=0.2,
                )
            except TimeoutError:
                early_result = 0
            assert early_result == 0

            await AuthService(reset_session).password_reset_confirm(
                reset_grant,
                "ResetFinishesBeforeLogin123",
            )
            await reset_session.commit()
            assert await asyncio.wait_for(login_task, timeout=5) == 401
        finally:
            if not login_task.done():
                login_task.cancel()
                await asyncio.gather(login_task, return_exceptions=True)
            if reset_session.in_transaction():
                await reset_session.rollback()


class CredentialEpochMigrationScenario:
    def __init__(self) -> None:
        self.engine: AsyncEngine = create_async_engine(settings.DATABASE_URL)
        self.schema: str = f"wp17_migration_{uuid4().hex}"
        migration_path: Path = Path(__file__).resolve().parents[3] / "alembic/versions/rwp17_auth_version.py"
        specification = importlib.util.spec_from_file_location("wp17_epoch_migration", migration_path)
        assert specification is not None and specification.loader is not None
        self.migration: ModuleType = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(self.migration)

    async def create(self) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
            await connection.execute(text(f'CREATE TABLE "{self.schema}".users (id integer PRIMARY KEY, auth_version integer NOT NULL DEFAULT 0)'))
            await connection.execute(text(f'INSERT INTO "{self.schema}".users (id) VALUES (1)'))

    async def connect(self) -> AsyncConnection:
        connection: AsyncConnection = await self.engine.connect()
        await connection.execute(text(f'SET search_path TO "{self.schema}"'))
        await connection.commit()
        return connection

    def downgrade(self, connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            self.migration.downgrade()

    def upgrade(self, connection: Connection) -> None:
        with Operations.context(MigrationContext.configure(connection)):
            self.migration.upgrade()

    async def is_blocked(self, process_id: int) -> bool:
        async with self.engine.connect() as observer:
            return bool(await observer.scalar(text("SELECT cardinality(pg_blocking_pids(:process_id)) > 0"), {"process_id": process_id}))

    async def close(self) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        await self.engine.dispose()


@pytest.mark.asyncio
async def test_zero_epoch_migration_can_downgrade_and_upgrade() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    connection: AsyncConnection = await scenario.connect()
    try:
        await connection.run_sync(scenario.downgrade)
        await connection.commit()
        await connection.run_sync(scenario.upgrade)
        await connection.commit()
        assert await connection.scalar(text("SELECT auth_version FROM users WHERE id = 1")) == 0
    finally:
        await connection.close()
        await scenario.close()


@pytest.mark.asyncio
async def test_downgrade_waits_for_prior_credential_writer_and_preserves_revocation() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    writer: AsyncConnection = await scenario.connect()
    downgrade_connection: AsyncConnection = await scenario.connect()
    downgrade_task: asyncio.Task[None] | None = None
    try:
        await writer.execute(text("UPDATE users SET auth_version = 1 WHERE id = 1"))
        downgrade_process_id: int = int(await downgrade_connection.scalar(text("SELECT pg_backend_pid()")))
        downgrade_task = asyncio.create_task(downgrade_connection.run_sync(scenario.downgrade))
        async with asyncio.timeout(5):
            while not await scenario.is_blocked(downgrade_process_id):
                await asyncio.sleep(0.01)
        await writer.commit()
        with pytest.raises(RuntimeError, match="credential revocations"):
            await downgrade_task
        await downgrade_connection.rollback()
        assert await writer.scalar(text("SELECT auth_version FROM users WHERE id = 1")) == 1
    finally:
        await writer.rollback()
        if downgrade_task is not None and not downgrade_task.done():
            downgrade_task.cancel()
            await asyncio.gather(downgrade_task, return_exceptions=True)
        await downgrade_connection.close()
        await writer.close()
        await scenario.close()


@pytest.mark.asyncio
async def test_downgrade_blocks_new_credential_writer_before_epoch_inspection() -> None:
    scenario: CredentialEpochMigrationScenario = CredentialEpochMigrationScenario()
    await scenario.create()
    inspected: asyncio.Event = asyncio.Event()
    release_downgrade: asyncio.Event = asyncio.Event()
    writer: AsyncConnection = await scenario.connect()
    downgrade_connection: AsyncConnection = await scenario.connect()
    writer_task: asyncio.Task[bool] | None = None
    downgrade_task: asyncio.Task[None] | None = None

    async def pause_after_inspection() -> None:
        inspected.set()
        await release_downgrade.wait()

    def after_cursor_execute(connection: Connection, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
        if statement.lstrip().upper().startswith("SELECT COUNT("):
            await_only(pause_after_inspection())

    async def revoke_credentials() -> bool:
        try:
            await writer.execute(text("UPDATE users SET auth_version = 1 WHERE id = 1"))
            await writer.commit()
            return True
        except DBAPIError:
            await writer.rollback()
            return False

    event.listen(downgrade_connection.sync_connection, "after_cursor_execute", after_cursor_execute)
    try:
        writer_process_id: int = int(await writer.scalar(text("SELECT pg_backend_pid()")))
        await writer.commit()
        downgrade_task = asyncio.create_task(downgrade_connection.run_sync(scenario.downgrade))
        await asyncio.wait_for(inspected.wait(), timeout=5)
        writer_task = asyncio.create_task(revoke_credentials())
        async with asyncio.timeout(5):
            while not writer_task.done() and not await scenario.is_blocked(writer_process_id):
                await asyncio.sleep(0.01)
        writer_was_blocked: bool = not writer_task.done()
        release_downgrade.set()
        await asyncio.wait_for(downgrade_task, timeout=5)
        await downgrade_connection.commit()
        writer_committed: bool = await asyncio.wait_for(writer_task, timeout=5)
        assert writer_was_blocked
        assert not writer_committed, "Downgrade discarded a concurrently committed credential revocation"
    finally:
        release_downgrade.set()
        for task in (writer_task, downgrade_task):
            if task is not None and not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
        await downgrade_connection.close()
        await writer.close()
        await scenario.close()
