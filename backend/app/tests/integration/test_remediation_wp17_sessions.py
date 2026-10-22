from app.core.login_identifier import LoginIdentifierParser
import asyncio
from typing import Any

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.redis import redis_client
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services.auth_service import AuthService
from app.tests.integration.test_remediation_wp17 import _create_password_reset_grant, _token_claims


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
    login_result = await AuthService(db_session).login(LoginIdentifierParser.from_email(test_student.email), "student_pass123")
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
            LoginIdentifierParser.from_email(test_student.email),
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
                await AuthService(login_session).login(LoginIdentifierParser.from_email(test_student.email), "student_pass123")
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
