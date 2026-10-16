import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient
import app.core.deps as deps_module
import app.db.session as db_session_module
import app.workers.tasks as worker_tasks_module
from app.core.redis import redis_client


BACKEND_ROOT = Path(__file__).resolve().parents[3]


class RedisFixtureFinalizationProbe:
    def __init__(self) -> None:
        self.backend_root: Path = BACKEND_ROOT
        self.probe_path: Path = self.backend_root / "app/tests/integration/test_wp09_autouse_probe.py"

    def run(self, source: str) -> subprocess.CompletedProcess[str]:
        basetemp: Path = Path("/scratch") / f"wp09-pytest-{uuid4().hex}"
        self.probe_path.write_text(source)
        try:
            return subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    str(self.probe_path),
                    "-q",
                    "-p",
                    "no:cacheprovider",
                    f"--confcutdir={self.backend_root / 'app/tests'}",
                    f"--basetemp={basetemp}",
                ],
                cwd=self.backend_root,
                env=os.environ.copy(),
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            self.probe_path.unlink(missing_ok=True)
            shutil.rmtree(basetemp, ignore_errors=True)


def test_request_and_worker_sessions_share_the_dedicated_test_factory() -> None:
    assert db_session_module.AsyncSessionLocal is deps_module.AsyncSessionLocal
    assert deps_module.AsyncSessionLocal is worker_tasks_module.AsyncSessionLocal
    assert deps_module.AsyncSessionLocal.kw["bind"].url.database == "imkon_test_db"


@pytest.mark.parametrize(
    ("database_url", "redis_url"),
    [
        (
            "postgresql+asyncpg://shared-db.invalid:5432/app",
            "redis://localhost:6379/15",
        ),
        (
            "postgresql+asyncpg://localhost:5432/imkon_test_db",
            "redis://shared-redis.invalid:6379/0",
        ),
        ("postgresql+asyncpg://localhost:5432/imkon_test_db?database=production", "redis://localhost:6379/15"),
        ("postgresql+asyncpg://localhost:5432/imkon_test_db#database=production", "redis://localhost:6379/15"),
        ("postgresql+asyncpg://localhost:5432/imkon_test_db", "redis://localhost:6379/15?db=0"),
        ("postgresql+asyncpg://localhost:5432/imkon_test_db", "redis://localhost:6379/15#db=0"),
        (None, None),
    ],
)
def test_unsafe_targets_are_rejected_before_application_imports(
    database_url: str | None,
    redis_url: str | None,
) -> None:
    script = """
import importlib.util
import sys
from pathlib import Path

blocked = []
class ImportObserver:
    def find_spec(self, fullname, path=None, target=None):
        if fullname in {"app.main", "app.core.redis", "app.db.session"}:
            blocked.append(fullname)
        return None

sys.meta_path.insert(0, ImportObserver())
spec = importlib.util.spec_from_file_location("wp09_conftest", Path("app/tests/conftest.py"))
module = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(module)
except Exception as error:
    print(f"REJECTED:{type(error).__name__}:{error}")
else:
    print("ACCEPTED")
print(f"APPLICATION_IMPORTS:{','.join(blocked)}")
"""
    process_environment = os.environ.copy()
    if database_url is None:
        process_environment.pop("TEST_DATABASE_URL", None)
    else:
        process_environment["TEST_DATABASE_URL"] = database_url
    if redis_url is None:
        process_environment.pop("TEST_REDIS_URL", None)
    else:
        process_environment["TEST_REDIS_URL"] = redis_url
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_ROOT,
        env=process_environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert "REJECTED:" in result.stdout, result.stdout + result.stderr
    assert "dedicated" in result.stdout.lower(), result.stdout + result.stderr
    assert "APPLICATION_IMPORTS:" in result.stdout
    assert "app.main" not in result.stdout
    assert "app.core.redis" not in result.stdout
    assert "app.db.session" not in result.stdout


@pytest.mark.asyncio
async def test_client_only_cleanup_preserves_foreign_redis_namespace(
    client: AsyncClient,
    redis_namespace_scope: Any,
    test_redis_connection: Any,
) -> None:
    owned_key = "client-only-owned-key"
    foreign_key = "wp09:foreign:sentinel"
    await redis_client.set(owned_key, "owned")
    await test_redis_connection.set(foreign_key, "preserve")

    try:
        response = await client.get("/health")
        assert response.status_code == 200
        await redis_namespace_scope.clean()
        assert await redis_client.get(owned_key) is None
        assert await test_redis_connection.get(foreign_key) == "preserve"
    finally:
        await test_redis_connection.delete(foreign_key)


@pytest.mark.asyncio
async def test_namespace_cleanup_runs_after_exception(
    redis_namespace_scope: Any,
    test_redis_connection: Any,
) -> None:
    owned_key = "exception-owned-key"
    foreign_key = "wp09:foreign:exception-sentinel"
    await test_redis_connection.set(foreign_key, "preserve")

    try:
        with pytest.raises(RuntimeError):
            async with redis_namespace_scope:
                await redis_client.set(owned_key, "owned")
                raise RuntimeError("simulated test failure")

        assert await redis_client.get(owned_key) is None
        assert await test_redis_connection.get(foreign_key) == "preserve"
    finally:
        await test_redis_connection.delete(foreign_key)


@pytest.mark.asyncio
async def test_pipeline_delete_namespaces_every_key(
    test_redis_connection: Any,
) -> None:
    owned_key = f"pipeline-owned-{uuid4().hex}"
    foreign_key = f"wp09:foreign:pipeline:{uuid4().hex}"
    await redis_client.set(owned_key, "owned")
    await test_redis_connection.set(foreign_key, "preserve")

    try:
        pipeline = redis_client.pipeline()
        pipeline.delete(owned_key, foreign_key)
        await pipeline.execute()

        assert await redis_client.get(owned_key) is None
        assert await test_redis_connection.get(foreign_key) == "preserve"
    finally:
        await test_redis_connection.delete(foreign_key)


@pytest.mark.parametrize("command_name", ["flushdb", "flushall", "keys", "migrate"])
def test_namespaced_redis_client_rejects_global_and_unsupported_commands(command_name: str) -> None:
    with pytest.raises(AttributeError):
        getattr(redis_client, command_name)


@pytest.mark.asyncio
async def test_namespaced_redis_client_eval_isolates_multi_key_operations(
    test_redis_connection: Any,
) -> None:
    foreign_key: str = f"wp09:foreign:{uuid4().hex}"
    owned_key_1: str = f"test:eval:key1:{uuid4().hex}"
    owned_key_2: str = f"test:eval:key2:{uuid4().hex}"
    await test_redis_connection.set(foreign_key, "preserve_foreign")
    await redis_client.set(owned_key_1, "value_1")
    await redis_client.set(owned_key_2, "value_2")

    try:
        script: str = """
        local k1 = KEYS[1]
        local k2 = KEYS[2]
        local prefix_arg = ARGV[1]
        local v1 = redis.call('GET', k1)
        local v2 = redis.call('GET', k2)
        redis.call('SET', k1, v1 .. '_updated')
        redis.call('SET', k2, v2 .. '_updated')
        return {k1, k2, prefix_arg}
        """
        eval_result: list[Any] = await redis_client.eval(
            script,
            2,
            owned_key_1,
            owned_key_2,
            "raw_arg_unchanged",
        )
        returned_arg: str = (
            eval_result[2].decode()
            if isinstance(eval_result[2], bytes)
            else str(eval_result[2])
        )
        assert returned_arg == "raw_arg_unchanged"

        updated_val_1: str | None = await redis_client.get(owned_key_1)
        updated_val_2: str | None = await redis_client.get(owned_key_2)
        assert updated_val_1 == "value_1_updated"
        assert updated_val_2 == "value_2_updated"

        assert await test_redis_connection.get(foreign_key) == "preserve_foreign"
    finally:
        await test_redis_connection.delete(foreign_key)
        await redis_client.delete(owned_key_1, owned_key_2)


def test_namespaced_redis_pipeline_rejects_global_commands() -> None:
    with pytest.raises(AttributeError):
        getattr(redis_client.pipeline(), "flushdb")


@pytest.mark.asyncio
async def test_pytest_autouse_cleanup_finalizes_after_failed_child_test(
    test_redis_connection: Any,
) -> None:
    foreign_key: str = f"wp09:failed-test-sentinel:{uuid4().hex}"
    await test_redis_connection.set(foreign_key, "preserve")
    probe: RedisFixtureFinalizationProbe = RedisFixtureFinalizationProbe()

    try:
        failing_case: subprocess.CompletedProcess[str] = probe.run(
            """
import pytest
from typing import Any
from app.core.redis import redis_client

@pytest.mark.asyncio
async def test_intentional_failure_after_writing_owned_key(test_redis_connection: Any) -> None:
    await redis_client.set("autouse-failure-marker", "owned")
    await test_redis_connection.set("FOREIGN_KEY", "preserve")
    raise AssertionError("wp09 intentional child failure")
""".replace("FOREIGN_KEY", foreign_key)
        )
        assert failing_case.returncode == 1, failing_case.stdout + failing_case.stderr
        assert "wp09 intentional child failure" in failing_case.stdout
        assert "1 failed" in failing_case.stdout

        verification_case: subprocess.CompletedProcess[str] = probe.run(
            """
import pytest
from typing import Any

@pytest.mark.asyncio
async def test_previous_failure_was_cleaned_and_foreign_sentinel_survived(test_redis_connection: Any) -> None:
    owned_keys = [key async for key in test_redis_connection.scan_iter(match="wp09:*:autouse-failure-marker")]
    assert owned_keys == []
    assert await test_redis_connection.get("FOREIGN_KEY") == "preserve"
""".replace("FOREIGN_KEY", foreign_key)
        )
        assert verification_case.returncode == 0, verification_case.stdout + verification_case.stderr
        assert "1 passed" in verification_case.stdout
    finally:
        await test_redis_connection.delete(foreign_key)
