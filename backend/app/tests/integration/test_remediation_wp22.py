import asyncio
import json
from typing import Any
import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from conftest import RedisNamespaceClient, TestTargetConfiguration, TEST_REDIS_PREFIX
from app.core.config import settings
from app.core.rate_limiter import (
    AtomicRateLimiter,
    COMMIT_LOCKOUT_SUCCESS_LUA,
    AuthenticationRateLimiter,
    check_rate_limit,
)
from app.core.redis import redis_client
from app.core.security import hash_password
from app.main import app
from app.models.outbox_event import OutboxEvent, OutboxEventKind
from app.models.user import User, UserRole
from app.services.auth_service import AuthService


@pytest.mark.asyncio
async def test_eval_adapter_namespaces_all_declared_keys() -> None:
    script: str = """
    local key1 = KEYS[1]
    local key2 = KEYS[2]
    local arg1 = ARGV[1]
    return {key1, key2, arg1}
    """
    result: list[str | bytes] = await redis_client.eval(
        script,
        2,
        "declared_key_one",
        "declared_key_two",
        "undeclared_raw_arg"
    )
    key_one_str: str = result[0].decode() if isinstance(result[0], bytes) else str(result[0])
    key_two_str: str = result[1].decode() if isinstance(result[1], bytes) else str(result[1])
    arg_one_str: str = result[2].decode() if isinstance(result[2], bytes) else str(result[2])

    assert key_one_str != "declared_key_one"
    assert key_one_str.endswith("declared_key_one")
    assert key_two_str != "declared_key_two"
    assert key_two_str.endswith("declared_key_two")
    assert arg_one_str == "undeclared_raw_arg"


@pytest.mark.asyncio
async def test_concurrent_rate_limit_race_at_boundary() -> None:
    test_key: str = "auth:test:race:counter"
    limit: int = 5
    window: int = 60

    await redis_client.set(test_key, "4", ex=window)

    concurrency_count: int = 4
    barrier: asyncio.Barrier = asyncio.Barrier(concurrency_count)
    admitted_count: int = 0
    denied_count: int = 0

    async def attempt_acquisition() -> None:
        nonlocal admitted_count, denied_count
        await barrier.wait()
        try:
            await check_rate_limit(test_key, limit, window)
            admitted_count += 1
        except HTTPException as exception:
            if exception.status_code == 429:
                denied_count += 1
            else:
                raise

    tasks: list[asyncio.Task[None]] = [
        asyncio.create_task(attempt_acquisition())
        for _ in range(concurrency_count)
    ]
    await asyncio.gather(*tasks)

    assert admitted_count == 1
    assert denied_count == concurrency_count - 1


@pytest.mark.asyncio
async def test_login_successful_requests_exhaust_capacity_budget(
    client: AsyncClient,
    test_student: User
) -> None:
    budget_limit: int = getattr(settings, "AUTH_LOGIN_RATE_LIMIT", 30)

    for attempt_index in range(budget_limit):
        response: Response = await client.post(
            "/api/v1/auth/login",
            json={"email": test_student.email, "password": "student_pass123"}
        )
        assert response.status_code == 200, f"Attempt {attempt_index} failed with {response.status_code}"

    denied_response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"}
    )
    assert denied_response.status_code == 429
    assert "Retry-After" in denied_response.headers
    retry_after: int = int(denied_response.headers["Retry-After"])
    assert retry_after >= 1


@pytest.mark.asyncio
async def test_failed_login_lockout_enforced(
    client: AsyncClient,
    test_student: User
) -> None:
    for attempt_index in range(5):
        response: Response = await client.post(
            "/api/v1/auth/login",
            json={"email": test_student.email, "password": "wrong_password"}
        )
        assert response.status_code == 401

    locked_response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "wrong_password"}
    )
    assert locked_response.status_code == 429
    assert "Retry-After" in locked_response.headers
    assert int(locked_response.headers["Retry-After"]) >= 1


async def load_credentials_event_ids(db_session: AsyncSession, email: str) -> list[int]:
    result = await db_session.execute(
        select(OutboxEvent.id).where(
            OutboxEvent.kind == OutboxEventKind.CREDENTIALS_EMAIL,
            OutboxEvent.recipient_email == email,
        )
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
async def test_resend_code_cooldown_prevents_repeated_generation(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User
) -> None:
    test_student.must_set_password = True
    db_session.add(test_student)
    await db_session.commit()

    first_response: Response = await client.post(
        "/api/v1/auth/resend-code",
        json={"email": test_student.email}
    )
    assert first_response.status_code == 204

    await db_session.refresh(test_student)
    initial_password_hash: str | None = test_student.password_hash
    initial_event_count: int = len(await load_credentials_event_ids(db_session, test_student.email))
    assert initial_event_count == 1

    second_response: Response = await client.post(
        "/api/v1/auth/resend-code",
        json={"email": test_student.email}
    )
    assert second_response.status_code == 429
    assert "Retry-After" in second_response.headers
    assert int(second_response.headers["Retry-After"]) >= 1

    await db_session.refresh(test_student)
    assert test_student.password_hash == initial_password_hash
    assert len(await load_credentials_event_ids(db_session, test_student.email)) == initial_event_count


@pytest.mark.asyncio
async def test_client_identity_ignores_spoofed_forwarded_headers(
    client: AsyncClient
) -> None:
    client_budget_limit: int = getattr(settings, "AUTH_RESET_CLIENT_LIMIT", 10)

    for attempt_index in range(client_budget_limit):
        spoofed_headers: dict[str, str] = {
            "X-Forwarded-For": f"203.0.113.{attempt_index + 1}",
            "Forwarded": f"for=203.0.113.{attempt_index + 1}"
        }
        response: Response = await client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": f"isolated_user_{attempt_index}@example.com"},
            headers=spoofed_headers
        )
        assert response.status_code == 200

    spoofed_denied: Response = await client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "isolated_user_overflow@example.com"},
        headers={"X-Forwarded-For": "198.51.100.99"}
    )
    assert spoofed_denied.status_code == 429


@pytest.mark.asyncio
async def test_password_reset_request_rate_limiting(
    client: AsyncClient,
    test_student: User
) -> None:
    reset_limit: int = getattr(settings, "AUTH_RESET_REQUEST_LIMIT", 3)
    for _ in range(reset_limit):
        response: Response = await client.post(
            "/api/v1/auth/password-reset/request",
            json={"email": test_student.email}
        )
        assert response.status_code == 200

    denied_response: Response = await client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": test_student.email}
    )
    assert denied_response.status_code == 429
    assert "Retry-After" in denied_response.headers
    assert int(denied_response.headers["Retry-After"]) >= 1


@pytest.mark.asyncio
async def test_rate_limiter_fails_closed_on_backend_error(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    async def mock_failing_eval(*args: object, **kwargs: object) -> None:
        raise ConnectionError("Simulated Redis connection disruption with secret_token_xyz")

    monkeypatch.setattr(redis_client, "eval", mock_failing_eval)

    with pytest.raises(HTTPException) as exception_info:
        await check_rate_limit("auth:test:failing:key", 5, 60)

    assert exception_info.value.status_code == 500
    assert "secret_token_xyz" not in str(exception_info.value.detail)
    assert exception_info.value.detail == "Security service is currently unavailable. Please try again later."


def test_config_policy_positive_validation() -> None:
    from pydantic import ValidationError
    from app.core.config import Settings

    valid_settings: Settings = Settings()
    assert valid_settings.AUTH_LOGIN_RATE_LIMIT > 0
    assert valid_settings.AUTH_RESEND_COOLDOWN_SECONDS > 0

    with pytest.raises(ValidationError):
        Settings(AUTH_LOGIN_RATE_LIMIT=0)

    with pytest.raises(ValidationError):
        Settings(AUTH_RESEND_COOLDOWN_SECONDS=-5)


@pytest.mark.asyncio
async def test_cooldown_holds_until_actual_redis_expiry(test_redis_connection: Any) -> None:
    key: str = "root:cooldown:last-fraction"
    await redis_client.set(key, "1", ex=60)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.pexpire(raw_key, 300)
    assert await test_redis_connection.pttl(raw_key) > 0
    assert await test_redis_connection.ttl(raw_key) == 0
    result = await AtomicRateLimiter().evaluate_cooldown(key, 60)
    assert not result.allowed
    assert result.retry_after >= 1


@pytest.mark.asyncio
async def test_cooldown_missing_and_persistent_key_policy(test_redis_connection: Any) -> None:
    limiter: AtomicRateLimiter = AtomicRateLimiter()
    key: str = "test:cooldown:policy:key"
    await redis_client.delete(key)

    missing_result = await limiter.evaluate_cooldown(key, 60)
    assert missing_result.allowed

    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.persist(raw_key)
    assert await test_redis_connection.ttl(raw_key) == -1

    persistent_result = await limiter.evaluate_cooldown(key, 60)
    assert not persistent_result.allowed
    assert persistent_result.retry_after == 60
    assert await test_redis_connection.ttl(raw_key) > 0


@pytest.mark.asyncio
async def test_failed_attempt_persistence_outage_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def unavailable(*args: Any, **kwargs: Any) -> None:
        raise ConnectionError("root-synthetic-secret")
    monkeypatch.setattr(redis_client, "eval", unavailable)
    with pytest.raises(HTTPException) as caught:
        await AuthenticationRateLimiter().record_login_failure("outage@example.com")
    assert caught.value.status_code >= 500
    assert "root-synthetic-secret" not in str(caught.value.detail)


@pytest.mark.asyncio
async def test_concurrent_failed_login_does_not_bypass_remaining_lockout_slot(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    email: str = "root-lockout@example.com"
    limit: int = settings.AUTH_LOGIN_LOCKOUT_LIMIT
    await redis_client.set(f"auth:attempts:login:{email}", str(limit - 1), ex=900)
    entered: int = 0
    all_entered: asyncio.Event = asyncio.Event()
    release: asyncio.Event = asyncio.Event()

    async def reject_password(self: AuthService, email: str, password: str) -> None:
        nonlocal entered
        entered += 1
        if entered == 4:
            all_entered.set()
        await release.wait()
        raise HTTPException(status_code=401, detail="Synthetic invalid credentials")

    monkeypatch.setattr(AuthService, "login", reject_password)
    tasks: list[asyncio.Task[Response]] = [
        asyncio.create_task(client.post("/api/v1/auth/login", json={"email": email, "password": "invalid"}))
        for _ in range(4)
    ]
    try:
        try:
            await asyncio.wait_for(all_entered.wait(), timeout=1)
        except asyncio.TimeoutError:
            pass
    finally:
        release.set()
    responses: list[Response] = await asyncio.gather(*tasks)
    admitted: int = sum(response.status_code == 401 for response in responses)
    assert admitted <= 1, f"{admitted} password checks entered with only one lockout slot remaining"


@pytest.mark.asyncio
async def test_cancelled_login_releases_only_its_lockout_reservation(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered: asyncio.Event = asyncio.Event()
    block: asyncio.Event = asyncio.Event()
    email: str = "root-cancel@example.com"

    async def pending_login(self: AuthService, email: str, password: str) -> None:
        entered.set()
        await block.wait()

    monkeypatch.setattr(AuthService, "login", pending_login)
    task: asyncio.Task[Response] = asyncio.create_task(
        client.post("/api/v1/auth/login", json={"email": email, "password": "invalid"})
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert await redis_client.get(f"auth:attempts:login:{email}") is None
    assert await redis_client.get(f"auth:budget:login:account:{email}") == "1"


@pytest.mark.asyncio
async def test_cancelled_verify_releases_only_its_lockout_reservation(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    entered: asyncio.Event = asyncio.Event()
    block: asyncio.Event = asyncio.Event()
    email: str = "root-cancel-verify@example.com"

    async def pending_verify(self: AuthService, email: str, code: str) -> Any:
        entered.set()
        await block.wait()

    monkeypatch.setattr(AuthService, "verify_code", pending_verify)
    task: asyncio.Task[Response] = asyncio.create_task(
        client.post("/api/v1/auth/verify-code", json={"email": email, "code": "123456"})
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert await redis_client.get(f"auth:attempts:{email}") is None
    assert await redis_client.get(f"auth:budget:verify:account:{email}") == "1"


@pytest.mark.asyncio
async def test_expired_reservation_cannot_release_new_window_slot(test_redis_connection: Any) -> None:
    email: str = "root-stale-window@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()
    old = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.pexpire(raw_key, 1)
    await asyncio.sleep(0.02)
    assert await redis_client.get(key) is None
    current = await limiter.reserve_login_slot(email)
    await old.release()
    assert await redis_client.get(key) == "1"
    await current.commit_failure()
    assert await redis_client.get(key) == "1"


@pytest.mark.asyncio
async def test_success_does_not_erase_other_inflight_reservation() -> None:
    email: str = "root-peer-reservation@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()
    first = await limiter.reserve_login_slot(email)
    second = await limiter.reserve_login_slot(email)
    await first.commit_success()
    await second.commit_failure()
    assert await redis_client.get(key) == "1"


@pytest.mark.asyncio
async def test_resend_rejection_does_not_call_email_service(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_student.must_set_password = True
    db_session.add(test_student)
    await db_session.commit()

    code_generation_count: int = 0
    original_generate = AuthService.issue_temporary_credentials

    async def track_generation(self: AuthService, user: User) -> None:
        nonlocal code_generation_count
        code_generation_count += 1
        await original_generate(self, user)

    monkeypatch.setattr(AuthService, "issue_temporary_credentials", track_generation)

    first_response: Response = await client.post(
        "/api/v1/auth/resend-code",
        json={"email": test_student.email}
    )
    assert first_response.status_code == 204
    assert code_generation_count == 1

    second_response: Response = await client.post(
        "/api/v1/auth/resend-code",
        json={"email": test_student.email}
    )
    assert second_response.status_code == 429
    assert code_generation_count == 1


@pytest.mark.asyncio
async def test_aggregate_budgets_enforced_across_distinct_asgi_peers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def mock_login_success(self: AuthService, email: str, password: str) -> Any:
        from app.schemas.auth import TokenPair
        return TokenPair(access_token="mock_access", refresh_token="mock_refresh", must_set_password=False)

    monkeypatch.setattr(AuthService, "login", mock_login_success)
    aggregate_limit: int = 5
    monkeypatch.setattr(settings, "AUTH_LOGIN_AGGREGATE_LIMIT", aggregate_limit)
    await redis_client.delete("auth:budget:login:aggregate")

    for index in range(aggregate_limit):
        peer_ip: str = f"198.51.100.{index + 1}"
        transport: ASGITransport = ASGITransport(app=app, client=(peer_ip, 12345))
        async with AsyncClient(transport=transport, base_url="http://test") as peer_client:
            response: Response = await peer_client.post(
                "/api/v1/auth/login",
                json={"email": f"peer_account_{index}@example.com", "password": "any"}
            )
            assert response.status_code == 200

    overflow_transport: ASGITransport = ASGITransport(app=app, client=("198.51.100.99", 12345))
    async with AsyncClient(transport=overflow_transport, base_url="http://test") as overflow_client:
        overflow_response: Response = await overflow_client.post(
            "/api/v1/auth/login",
            json={"email": "peer_overflow@example.com", "password": "any"}
        )
        assert overflow_response.status_code == 429
        assert int(overflow_response.headers.get("Retry-After", "0")) >= 1


@pytest.mark.asyncio
async def test_independent_redis_connections_lockout_race_at_boundary() -> None:
    _, redis_url = TestTargetConfiguration.validate()
    email: str = "independent-redis-race@example.com"
    key: str = f"auth:attempts:login:{email}"
    await redis_client.set(key, "4", ex=900)
    connections: list[Redis] = [
        Redis.from_url(redis_url, decode_responses=True, single_connection_client=True)
        for _ in range(4)
    ]
    barrier: asyncio.Barrier = asyncio.Barrier(len(connections))

    async def attempt_worker(connection: Redis) -> bool:
        atomic_limiter: AtomicRateLimiter = AtomicRateLimiter()
        atomic_limiter._redis = RedisNamespaceClient(connection, TEST_REDIS_PREFIX)
        limiter: AuthenticationRateLimiter = AuthenticationRateLimiter(atomic_limiter)
        await barrier.wait()
        try:
            reservation = await limiter.reserve_login_slot(email)
            await reservation.commit_failure()
            return True
        except HTTPException as exception:
            assert exception.status_code == 429
            return False

    try:
        client_ids: list[int] = await asyncio.gather(*(connection.client_id() for connection in connections))
        assert len(set(client_ids)) == len(connections)
        admitted: list[bool] = await asyncio.gather(*(attempt_worker(connection) for connection in connections))
        assert admitted.count(True) == 1
        assert admitted.count(False) == 3
        assert await redis_client.get(key) == "5"
    finally:
        await asyncio.gather(*(connection.aclose() for connection in connections))


@pytest.mark.asyncio
async def test_old_success_cannot_clear_new_window_failures(
    test_redis_connection: Any,
) -> None:
    email: str = "old-success-isolation@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()
    old = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.pexpire(raw_key, 1)
    await asyncio.sleep(0.02)
    assert await redis_client.get(key) is None
    current = await limiter.reserve_login_slot(email)
    await current.commit_failure()
    assert await redis_client.get(key) == "1"
    await old.commit_success()
    assert await redis_client.get(key) == "1"


@pytest.mark.asyncio
async def test_old_failure_cannot_increment_new_window(
    test_redis_connection: Any,
) -> None:
    email: str = "old-failure-isolation@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()
    old = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.pexpire(raw_key, 1)
    await asyncio.sleep(0.02)
    assert await redis_client.get(key) is None
    current = await limiter.reserve_login_slot(email)
    assert await redis_client.get(key) == "1"
    await old.commit_failure()
    assert await redis_client.get(key) == "1"
    await current.release()


@pytest.mark.asyncio
async def test_success_settlement_outage_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()
    reservation = await limiter.reserve_login_slot("success-outage@example.com")

    async def unavailable(*args: Any, **kwargs: Any) -> None:
        raise ConnectionError("synthetic-secret-credential")

    monkeypatch.setattr(redis_client, "eval", unavailable)
    with pytest.raises(HTTPException) as caught:
        await reservation.commit_success()
    assert caught.value.status_code >= 500
    assert "synthetic-secret-credential" not in str(caught.value.detail)


@pytest.mark.asyncio
async def test_settlement_write_failure_paths_fail_closed_without_leaking_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()

    secret: str = "injected-credential-xyz987"

    async def outage(*args: Any, **kwargs: Any) -> None:
        raise ConnectionError(secret)

    res_fail = await limiter.reserve_login_slot("fail-outage@example.com")
    res_rel = await limiter.reserve_login_slot("release-outage@example.com")

    monkeypatch.setattr(redis_client, "eval", outage)

    with pytest.raises(HTTPException) as caught_fail:
        await res_fail.commit_failure()
    assert caught_fail.value.status_code >= 500
    assert secret not in str(caught_fail.value.detail)

    with pytest.raises(HTTPException) as caught_rel:
        await res_rel.release()
    assert caught_rel.value.status_code >= 500
    assert secret not in str(caught_rel.value.detail)


@pytest.mark.asyncio
async def test_stale_settlement_before_and_after_new_window_and_duplicate_finalization(
    test_redis_connection: Any,
) -> None:
    email: str = "stale-settlement-lifecycle@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()

    res1 = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    await test_redis_connection.pexpire(raw_key, 1)
    await asyncio.sleep(0.02)
    assert await redis_client.get(key) is None

    await res1.commit_failure()
    assert await redis_client.get(key) is None
    await res1.commit_success()
    assert await redis_client.get(key) is None
    await res1.release()
    assert await redis_client.get(key) is None

    res2 = await limiter.reserve_login_slot(email)
    await res2.commit_failure()
    assert await redis_client.get(key) == "1"

    await res1.commit_failure()
    assert await redis_client.get(key) == "1"
    await res1.commit_success()
    assert await redis_client.get(key) == "1"
    await res1.release()
    assert await redis_client.get(key) == "1"

    await res2.commit_failure()
    assert await redis_client.get(key) == "1"
    await res2.commit_success()
    assert await redis_client.get(key) == "1"
    await res2.release()
    assert await redis_client.get(key) == "1"


@pytest.mark.asyncio
async def test_fixed_window_expiry_not_extended_on_subsequent_reservation(
    test_redis_connection: Any,
) -> None:
    email: str = "fixed-window-ttl@example.com"
    key: str = f"auth:attempts:login:{email}"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()

    res1 = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)

    await test_redis_connection.pexpire(raw_key, 5000)
    await asyncio.sleep(0.05)

    pttl_before: int = await test_redis_connection.pttl(raw_key)
    assert 0 < pttl_before <= 5000

    res2 = await limiter.reserve_login_slot(email)
    pttl_after: int = await test_redis_connection.pttl(raw_key)

    assert pttl_after <= pttl_before
    assert pttl_after < 60000

    await res1.release()
    await res2.release()


@pytest.mark.asyncio
async def test_counter_and_inflight_expiry_aligned_at_millisecond_precision(
    test_redis_connection: Any,
) -> None:
    email: str = "aligned-expiry@example.com"
    key: str = f"auth:attempts:login:{email}"
    inflight_key: str = f"{key}:inflight"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()

    res = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    raw_inflight: str = await redis_client.eval("return KEYS[1]", 1, inflight_key)

    key_pttl: int = await test_redis_connection.pttl(raw_key)
    inflight_pttl: int = await test_redis_connection.pttl(raw_inflight)

    assert key_pttl > 0
    assert inflight_pttl > 0
    assert abs(key_pttl - inflight_pttl) <= 50

    await res.release()


@pytest.mark.asyncio
async def test_orphan_inflight_hash_cannot_authorize_settlement_after_counter_expired(
    test_redis_connection: Any,
) -> None:
    email: str = "orphan-inflight@example.com"
    key: str = f"auth:attempts:login:{email}"
    inflight_key: str = f"{key}:inflight"
    limiter: AuthenticationRateLimiter = AuthenticationRateLimiter()

    res = await limiter.reserve_login_slot(email)
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    raw_inflight: str = await redis_client.eval("return KEYS[1]", 1, inflight_key)

    await test_redis_connection.delete(raw_key)
    assert await redis_client.get(key) is None

    await res.commit_failure()
    assert await redis_client.get(key) is None
    assert await test_redis_connection.exists(raw_inflight) == 0


@pytest.mark.asyncio
async def test_token_issuance_rolls_back_when_commit_success_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sqlalchemy import text

    count_before: int = (
        await db_session.execute(text("SELECT count(*) FROM refresh_tokens"))
    ).scalar() or 0

    original_eval = redis_client.eval
    successful_settlements: int = 0
    issued_refresh_tokens: int = 0
    original_issue_refresh_token = AuthService._issue_refresh_token

    async def observed_issue_refresh_token(self: AuthService, user: User) -> str:
        nonlocal issued_refresh_tokens
        token: str = await original_issue_refresh_token(self, user)
        issued_refresh_tokens += 1
        return token

    monkeypatch.setattr(AuthService, "_issue_refresh_token", observed_issue_refresh_token)

    async def failing_eval(script: str, numkeys: int, *keys_and_args: Any) -> Any:
        nonlocal successful_settlements
        if script == COMMIT_LOCKOUT_SUCCESS_LUA:
            successful_settlements += 1
            raise ConnectionError("redis-cluster-partition-error")
        return await original_eval(script, numkeys, *keys_and_args)

    monkeypatch.setattr(redis_client, "eval", failing_eval)

    response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"}
    )
    assert response.status_code == 500
    assert issued_refresh_tokens == 1
    assert successful_settlements == 1
    assert "redis-cluster-partition-error" not in response.text

    count_after: int = (
        await db_session.execute(text("SELECT count(*) FROM refresh_tokens"))
    ).scalar() or 0
    assert count_after == count_before



@pytest.mark.asyncio
async def test_admitted_budget_repairs_missing_expiry_without_resetting_fixed_window(
    test_redis_connection: Redis,
) -> None:
    key: str = "auth:test:persistent-budget"
    await redis_client.set(key, "1")
    raw_key: str = await redis_client.eval("return KEYS[1]", 1, key)
    limiter: AtomicRateLimiter = AtomicRateLimiter()
    result = await limiter.evaluate_limit(key, 5, 60)
    assert result.allowed
    assert result.current_count == 2
    repaired_ttl: int = await test_redis_connection.pttl(raw_key)
    assert 0 < repaired_ttl <= 60000
    await test_redis_connection.pexpire(raw_key, 5000)
    result = await limiter.evaluate_limit(key, 5, 60)
    assert result.allowed
    assert 0 < await test_redis_connection.pttl(raw_key) <= 5000
