import inspect
import json
from typing import Any
from unittest.mock import AsyncMock, create_autospec

import pytest
from httpx import AsyncClient, Response
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import deps
from app.core.config import settings
from app.core.login_identifier import LoginIdentifierParser
from app.main import app
from app.models.user import User
from app.schemas.auth import TokenPair
from app.services.auth_service import AuthService
from app.repositories.interfaces.user_repository import AuthUserRepository
from app.repositories.interfaces.refresh_token_repository import AuthRefreshTokenRepository, ConsumedRefreshToken
from fastapi import HTTPException


class TestAuthenticationInjection:
    def test_collaborators_are_required(self) -> None:
        signature: inspect.Signature = inspect.signature(AuthService)
        assert "db" not in signature.parameters
        assert len(signature.parameters) >= 8
        parameter: inspect.Parameter
        for parameter in signature.parameters.values():
            assert parameter.default is inspect.Parameter.empty
            assert parameter.annotation is not inspect.Parameter.empty
        arguments: dict[str, Any] = {name: object() for name in signature.parameters}
        name: str
        for name in signature.parameters:
            missing: dict[str, Any] = {key: value for key, value in arguments.items() if key != name}
            with pytest.raises(TypeError):
                AuthService(**missing)
            with pytest.raises(ValueError, match="collaborators are required"):
                AuthService(**{**arguments, name: None})

    @pytest.mark.asyncio
    async def test_route_uses_overridden_narrow_repositories(
        self, client: AsyncClient, test_student: User,
    ) -> None:
        user_repository: AsyncMock = create_autospec(AuthUserRepository, instance=True)
        user_repository.get_by_login_for_update.return_value = test_student
        token_repository: AsyncMock = create_autospec(AuthRefreshTokenRepository, instance=True)
        app.dependency_overrides[deps.get_auth_user_repository] = lambda: user_repository
        app.dependency_overrides[deps.get_auth_refresh_token_repository] = lambda: token_repository
        try:
            response: Response = await client.post(
                "/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"},
            )
            assert response.status_code == 200, response.text
            user_repository.get_by_login_for_update.assert_awaited_once()
            token_repository.create.assert_awaited_once()
            user_repository.get_by_id_for_update.return_value = test_student
            token_repository.rotate_valid_token.side_effect = [ConsumedRefreshToken(family_id=None), None]
            token_repository.find_rotated_token.return_value = None
            rotated: Response = await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": response.json()["refresh_token"]},
            )
            assert rotated.status_code == 200
            assert rotated.json()["refresh_token"] != response.json()["refresh_token"]
            replay: Response = await client.post(
                "/api/v1/auth/refresh", json={"refresh_token": response.json()["refresh_token"]},
            )
            assert replay.status_code == 401
        finally:
            app.dependency_overrides.pop(deps.get_auth_user_repository)
            app.dependency_overrides.pop(deps.get_auth_refresh_token_repository)

    @pytest.mark.asyncio
    async def test_sql_rotation_scope_and_no_hidden_commit(
        self, db_session: AsyncSession, test_student: User,
    ) -> None:
        service: AuthService = deps.AuthServiceComposition.create(db_session)
        commit: AsyncMock = AsyncMock(side_effect=AssertionError("hidden commit"))
        db_session.commit = commit
        stored_user: User = await db_session.merge(test_student)
        stored_user.must_set_password = True
        await db_session.flush()
        pair: TokenPair = await service.login(
            LoginIdentifierParser.from_email(test_student.email), "student_pass123",
        )
        payload: dict[str, Any] = jwt.decode(pair.access_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        assert payload["scope"] == "must_set_password"
        rotated: TokenPair = await service.refresh(pair.refresh_token)
        assert rotated.refresh_token != pair.refresh_token
        replayed_within_grace: TokenPair = await service.refresh(pair.refresh_token)
        assert replayed_within_grace.refresh_token not in {pair.refresh_token, rotated.refresh_token}
        await service.set_password(test_student.id, "Changed123")
        await service.change_password(test_student.id, "Changed123", "Changed456")
        await service.issue_temporary_credentials(stored_user)
        await service.resend_code(test_student.email)
        verification_code: str = await service.generate_verification_code(test_student.email)
        verified: TokenPair = await service.verify_code(test_student.email, verification_code)
        assert verified.must_set_password
        await service.password_reset_request(LoginIdentifierParser.from_email(test_student.email))
        from app.core.redis import redis_client
        reset_data: str | None = await redis_client.get(f"auth:reset:{test_student.email}")
        assert reset_data is not None
        reset_grant: str = await service.password_reset_verify(test_student.email, json.loads(reset_data)["code"])
        await service.password_reset_confirm(reset_grant, "Recovered123")
        await service.logout(rotated.refresh_token)
        commit.assert_not_awaited()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("use_doubles", [False, True])
    async def test_recovery_scope_and_replay_through_dependencies(
        self, client: AsyncClient, test_student: User, use_doubles: bool,
    ) -> None:
        from app.core.redis import redis_client
        from app.core.verification_codes import ChallengeOutcome, ChallengeResult
        from app.services.auth_service import AuthChallengeConsumer, AuthChallengeWriter, AuthMailOutbox

        users: AsyncMock = create_autospec(AuthUserRepository, instance=True)
        tokens: AsyncMock = create_autospec(AuthRefreshTokenRepository, instance=True)
        consumer: AsyncMock = create_autospec(AuthChallengeConsumer, instance=True)
        writer: AsyncMock = create_autospec(AuthChallengeWriter, instance=True)
        outbox: AsyncMock = create_autospec(AuthMailOutbox, instance=True)
        users.get_by_login_for_update.return_value = test_student
        users.get_by_email_for_update.return_value = test_student
        users.get_by_id_for_update.return_value = test_student
        overrides: dict[Any, Any] = {
            deps.get_auth_user_repository: lambda: users,
            deps.get_auth_refresh_token_repository: lambda: tokens,
            deps.get_auth_challenge_consumer: lambda: consumer,
            deps.get_auth_challenge_writer: lambda: writer,
            deps.get_auth_mail_outbox: lambda: outbox,
        }
        if use_doubles:
            app.dependency_overrides.update(overrides)
        try:
            request: Response = await client.post(
                "/api/v1/auth/password-reset/request", json={"email": test_student.email},
            )
            assert request.status_code == 200
            if use_doubles:
                writer.set.assert_awaited_once()
                outbox.enqueue_password_reset_email.assert_awaited_once()
                consumer.consume.return_value = ChallengeResult(ChallengeOutcome.CONSUMED, 1)
            else:
                await redis_client.set(f"auth:reset:{test_student.email}", '{"code":"123456","attempts":0}', ex=600)
            verified: Response = await client.post(
                "/api/v1/auth/password-reset/verify", json={"email": test_student.email, "code": "123456"},
            )
            assert verified.status_code == 200, verified.text
            confirmed: Response = await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"reset_token": verified.json()["reset_token"], "new_password": "Recovered123"},
            )
            assert confirmed.status_code == 200, confirmed.text
            repeated: Response = await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"reset_token": verified.json()["reset_token"], "new_password": "Repeated123"},
            )
            assert repeated.status_code == 400
            if use_doubles:
                tokens.revoke_all_for_user.assert_awaited_once_with(test_student.id)
                consumer.consume.return_value = ChallengeResult(ChallengeOutcome.CONSUMED, 1)
            else:
                await redis_client.set(f"auth:code:{test_student.email}", '{"code":"123456","attempts":0}', ex=600)
            setup: Response = await client.post(
                "/api/v1/auth/verify-code", json={"email": test_student.email, "code": "123456"},
            )
            assert setup.status_code == 200, setup.text
            payload: dict[str, Any] = jwt.decode(setup.json()["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"])
            assert payload["scope"] == "must_set_password"
            assert setup.json()["refresh_token"] is None
            denied: Response = await client.get(
                "/api/v1/users/me", headers={"Authorization": f"Bearer {setup.json()['access_token']}"},
            )
            assert denied.status_code == 403
        finally:
            if use_doubles:
                dependency: Any
                for dependency in overrides:
                    app.dependency_overrides.pop(dependency)

    @pytest.mark.asyncio
    async def test_sms_collaborator_and_budget_are_substitutable(
        self, client: AsyncClient, test_student: User, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.core.rate_limiter import AuthenticationRateLimiter
        reset_budget: AsyncMock = AsyncMock()
        monkeypatch.setattr(AuthenticationRateLimiter, "consume_password_reset_budgets", reset_budget)
        from app.services.auth_service import AuthPasswordSms, AuthSmsBudget
        from app.services.sms.messages import PasswordSmsReason
        from app.services.student_password_sms_service import PasswordSmsDestination, PasswordSmsDestinationKind

        users: AsyncMock = create_autospec(AuthUserRepository, instance=True)
        users.get_by_login_for_update.return_value = test_student
        sms: Any = create_autospec(AuthPasswordSms, instance=True)
        budget: AsyncMock = create_autospec(AuthSmsBudget, instance=True)
        destination: PasswordSmsDestination = PasswordSmsDestination(PasswordSmsDestinationKind.STUDENT_PHONE, "+992901234567")
        sms.resolve_channel_destination.return_value = destination
        overrides: dict[Any, Any] = {
            deps.get_auth_user_repository: lambda: users,
            deps.get_auth_password_sms: lambda: sms,
            deps.get_auth_sms_budget: lambda: budget,
        }
        app.dependency_overrides.update(overrides)
        try:
            response: Response = await client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": test_student.email, "channel": "student_phone"},
            )
            assert response.status_code == 200
            budget.consume_ip_budget.assert_awaited_once()
            sms.issue_password.assert_awaited_once_with(
                test_student, PasswordSmsReason.RESET, None,
                enforce_rate_limits=True, channel=PasswordSmsDestinationKind.STUDENT_PHONE,
            )
            budget.consume_ip_budget.side_effect = HTTPException(429)
            sms.issue_password.reset_mock()
            limited: Response = await client.post(
                "/api/v1/auth/password-reset/request",
                json={"email": test_student.email, "channel": "student_phone"},
            )
            assert limited.status_code == 200
            sms.issue_password.assert_not_awaited()
        finally:
            dependency: Any
            for dependency in overrides:
                app.dependency_overrides.pop(dependency)
