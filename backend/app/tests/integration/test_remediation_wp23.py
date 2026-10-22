from app.core.login_identifier import LoginIdentifierParser
import asyncio
import json
from typing import Any

import pytest
from fastapi import HTTPException
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.models.user import User
from app.services.auth_service import AuthService
from app.tests.conftest import RedisNamespaceClient, TEST_REDIS_PREFIX, TestingSessionLocal
import app.services.auth_service as auth_module


class IndependentChallengeClients:
    def __init__(self, count: int) -> None:
        self.barrier: asyncio.Barrier = asyncio.Barrier(count)
        self.connections: list[Redis] = [Redis.from_url(settings.REDIS_URL, decode_responses=True) for _ in range(count)]
        self.clients: list[RedisNamespaceClient] = [RedisNamespaceClient(connection, TEST_REDIS_PREFIX) for connection in self.connections]
        self.tasks: dict[asyncio.Task[Any], RedisNamespaceClient] = {}

    async def get(self, key: str) -> str | None:
        task: asyncio.Task[Any] | None = asyncio.current_task()
        assert task is not None
        value: str | None = await self.tasks[task].get(key)
        await self.barrier.wait()
        return value

    async def set(self, key: str, value: Any, **kwargs: Any) -> bool | None:
        task: asyncio.Task[Any] | None = asyncio.current_task()
        assert task is not None
        return await self.tasks[task].set(key, value, **kwargs)

    async def delete(self, *keys: str) -> int:
        task: asyncio.Task[Any] | None = asyncio.current_task()
        assert task is not None
        return await self.tasks[task].delete(*keys)

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        task: asyncio.Task[Any] | None = asyncio.current_task()
        assert task is not None
        await self.barrier.wait()
        return await self.tasks[task].eval(script, numkeys, *keys_and_args)

    async def submit(self, index: int, namespace: str, email: str, code: str) -> bool:
        task: asyncio.Task[Any] | None = asyncio.current_task()
        assert task is not None
        self.tasks[task] = self.clients[index]
        async with TestingSessionLocal() as session:
            service: AuthService = AuthService(session)
            try:
                if namespace == 'code':
                    await service.verify_code(email, code)
                else:
                    await service.password_reset_verify(email, code)
                return True
            except HTTPException as error:
                assert error.status_code == 400
                return False

    async def close(self) -> None:
        for connection in self.connections:
            await connection.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
@pytest.mark.parametrize('submissions', [['000000'] * 5, ['123456'] * 5, ['123456', '000000', '123456', '000000', '000000']])
async def test_independent_clients_atomically_exhaust_or_consume(
    namespace: str, submissions: list[str], test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    key: str = f'auth:{namespace}:{test_student.email}'
    await redis_client.set(key, json.dumps({'code': '123456', 'attempts': 0}), ex=600)
    budget_keys: list[str] = [f'auth:budget:verify:account:{test_student.email}', f'auth:cooldown:resend:{test_student.email}', f'auth:reset_request:{test_student.email}']
    for budget_key in budget_keys:
        await redis_client.set(budget_key, '17', ex=600)
    clients: IndependentChallengeClients = IndependentChallengeClients(len(submissions))
    assert len({id(connection.connection_pool) for connection in clients.connections}) == len(submissions)
    monkeypatch.setattr(auth_module, 'redis_client', clients)
    try:
        results: list[bool] = await asyncio.gather(*(clients.submit(index, namespace, test_student.email, code) for index, code in enumerate(submissions)))
        assert sum(results) == (1 if '123456' in submissions else 0)
        assert await redis_client.get(key) is None
        for budget_key in budget_keys:
            assert await redis_client.get(budget_key) == '17'
    finally:
        await clients.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
@pytest.mark.parametrize('raw', ['not-json', '[]', '{}', '{"code":"123456","attempts":-1}', '{"code":"123456","attempts":0.5}', '{"code":"123456","attempts":true}', '{"code":123456,"attempts":0}', '{"code":"123456","attempts":0}'])
async def test_invalid_or_persistent_state_never_authorizes(
    namespace: str, raw: str, db_session: AsyncSession, test_student: User,
) -> None:
    key: str = f'auth:{namespace}:{test_student.email}'
    if raw == '{"code":"123456","attempts":0}':
        await redis_client.set(key, raw)
    else:
        await redis_client.set(key, raw, ex=600)
    service: AuthService = AuthService(db_session)
    with pytest.raises(HTTPException) as caught:
        if namespace == 'code':
            await service.verify_code(test_student.email, '123456')
        else:
            await service.password_reset_verify(test_student.email, '123456')
    assert caught.value.status_code in (400, 503)


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
async def test_failed_attempt_preserves_expiry_and_other_namespace(
    namespace: str, db_session: AsyncSession, test_student: User, test_redis_connection: Redis,
) -> None:
    key: str = f'auth:{namespace}:{test_student.email}'
    other_key: str = f'auth:{"reset" if namespace == "code" else "code"}:{test_student.email}'
    data: str = json.dumps({'code': '123456', 'attempts': 0})
    await redis_client.set(key, data, px=3000)
    await redis_client.set(other_key, data, ex=600)
    before_ttl: int = await test_redis_connection.pttl(f'{TEST_REDIS_PREFIX}{key}')
    service: AuthService = AuthService(db_session)
    with pytest.raises(HTTPException):
        if namespace == 'code':
            await service.verify_code(test_student.email, '000000')
        else:
            await service.password_reset_verify(test_student.email, '000000')
    raw: str | None = await redis_client.get(key)
    assert raw is not None
    assert json.loads(raw)['attempts'] == 1
    assert 0 < await test_redis_connection.pttl(f'{TEST_REDIS_PREFIX}{key}') <= before_ttl
    assert await redis_client.get(other_key) == data
    await test_redis_connection.pexpire(f'{TEST_REDIS_PREFIX}{key}', 1)
    await asyncio.sleep(0.01)
    with pytest.raises(HTTPException) as caught:
        if namespace == 'code':
            await service.verify_code(test_student.email, '123456')
        else:
            await service.password_reset_verify(test_student.email, '123456')
    assert caught.value.status_code == 400


class UnavailableChallengeRedis:
    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        raise ConnectionError('synthetic-secret-code-123456')


class InvalidChallengeRedis:
    def __init__(self, result: Any) -> None:
        self.result: Any = result

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        return self.result


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
@pytest.mark.parametrize('backend', [UnavailableChallengeRedis(), InvalidChallengeRedis(['consumed', 0]), InvalidChallengeRedis(['consumed', True]), InvalidChallengeRedis(['unknown', 1]), InvalidChallengeRedis(['consumed']), InvalidChallengeRedis(['consumed', 6])])
async def test_backend_error_or_invalid_result_fails_closed(
    namespace: str, backend: Any, db_session: AsyncSession, test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_module, 'redis_client', backend)
    service: AuthService = AuthService(db_session)
    with pytest.raises(HTTPException) as caught:
        if namespace == 'code':
            await service.verify_code(test_student.email, '123456')
        else:
            await service.password_reset_verify(test_student.email, '123456')
    assert caught.value.status_code == 503
    assert '123456' not in str(caught.value.detail)


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
async def test_database_failure_never_restores_consumed_code_and_new_request_recovers(
    namespace: str, db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    key: str = f'auth:{namespace}:{test_mentor.email}'
    await redis_client.set(key, json.dumps({'code': '123456', 'attempts': 0}), ex=600)
    service: AuthService = AuthService(db_session)
    original_lookup: Any = service.user_repo.get_by_email_for_update

    async def unavailable(email: str) -> User | None:
        raise RuntimeError('database temporarily unavailable')

    monkeypatch.setattr(service.user_repo, 'get_by_email_for_update', unavailable)
    with pytest.raises(RuntimeError):
        if namespace == 'code':
            await service.verify_code(test_mentor.email, '123456')
        else:
            await service.password_reset_verify(test_mentor.email, '123456')
    assert await redis_client.get(key) is None
    monkeypatch.setattr(service.user_repo, 'get_by_email_for_update', original_lookup)
    with pytest.raises(HTTPException) as caught:
        if namespace == 'code':
            await service.verify_code(test_mentor.email, '123456')
        else:
            await service.password_reset_verify(test_mentor.email, '123456')
    assert caught.value.status_code == 400
    if namespace == 'code':
        await service.generate_verification_code(test_mentor.email)
    else:
        await service.password_reset_request(LoginIdentifierParser.from_email(test_mentor.email))
    raw: str | None = await redis_client.get(key)
    assert raw is not None
    fresh_code: str = json.loads(raw)['code']
    if namespace == 'code':
        await service.verify_code(test_mentor.email, fresh_code)
    else:
        await service.password_reset_verify(test_mentor.email, fresh_code)
    assert await redis_client.get(key) is None


@pytest.mark.asyncio
@pytest.mark.parametrize('namespace', ['code', 'reset'])
@pytest.mark.parametrize('attempts', [4, 5])
async def test_fifth_submission_is_last_available_attempt(
    namespace: str, attempts: int, db_session: AsyncSession, test_mentor: User,
) -> None:
    key: str = f'auth:{namespace}:{test_mentor.email}'
    await redis_client.set(key, json.dumps({'code': '123456', 'attempts': attempts}), ex=600)
    service: AuthService = AuthService(db_session)
    if attempts == 5:
        with pytest.raises(HTTPException) as caught:
            if namespace == 'code':
                await service.verify_code(test_mentor.email, '123456')
            else:
                await service.password_reset_verify(test_mentor.email, '123456')
        assert caught.value.status_code == 400
    elif namespace == 'code':
        await service.verify_code(test_mentor.email, '123456')
    else:
        await service.password_reset_verify(test_mentor.email, '123456')
    assert await redis_client.get(key) is None
