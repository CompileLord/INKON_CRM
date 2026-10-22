from typing import Any
from pathlib import Path

import pytest
from pydantic import ValidationError


@pytest.mark.parametrize("overrides", [{"DB_CONNECTION_BUDGET": 59}, {"DB_REVISION_OVERLAP": 0}, {"DB_POOL_SIZE": 0}, {"DB_LOCK_TIMEOUT_MS": 15001}, {"DB_MAINTENANCE_STATEMENT_TIMEOUT_MS": 1000}, {"DB_API_PROCESSES": 2}])
def test_invalid_budget_and_deadlines_are_rejected(overrides: dict[str, Any]) -> None:
    from app.db.connection_policy import DatabaseConnectionPolicy

    with pytest.raises(ValidationError):
        DatabaseConnectionPolicy(**overrides)


def test_default_budget_counts_shared_cleanup_storage_engine_once() -> None:
    from app.db.connection_policy import DatabaseConnectionPolicy

    policy: DatabaseConnectionPolicy = DatabaseConnectionPolicy()
    assert policy.revision_ceiling == 24
    assert policy.deployment_ceiling == 60
    assert policy.DB_CONNECTION_BUDGET == 100
    assert policy.main_engine_options()["connect_args"]["server_settings"] == {
        "statement_timeout": "15000", "lock_timeout": "2000", "idle_in_transaction_session_timeout": "15000"
    }


def test_deploy_rejects_invalid_budget_before_data_service_commands(tmp_path: Path) -> None:
    import os
    import subprocess
    from pathlib import Path

    repository: Path = Path(__file__).resolve().parents[4]
    commands: Path = tmp_path / "commands.log"
    binary_directory: Path = tmp_path / "bin"
    binary_directory.mkdir()
    docker: Path = binary_directory / "docker"
    docker.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$WP43_COMMAND_LOG\"\ncase \"$*\" in *app.db.connection_policy*) exec python -m app.db.connection_policy ;; esac\nexit 0\n")
    docker.chmod(0o700)
    data: Path = tmp_path / "data"
    data.mkdir()
    environment: dict[str, str] = dict(os.environ)
    environment.update({"PATH": f"{binary_directory}:{environment['PATH']}", "WP43_COMMAND_LOG": str(commands), "IMKON_DATA_DIR": str(data), "BACKUP_DIRECTORY": str(tmp_path / "backups"), "DEPLOY_CONFIGURATION_FILE": str(tmp_path / "missing.env"), "DB_CONNECTION_BUDGET": "59"})
    result: subprocess.CompletedProcess[str] = subprocess.run(["bash", str(repository / "deploy/deploy.sh"), "abc1234"], env=environment, capture_output=True, text=True, timeout=15)
    assert result.returncode != 0
    assert "exceed the deployment database budget" in result.stderr
    invoked: str = commands.read_text()
    assert "app.db.connection_policy" in invoked
    assert " up " not in invoked
    assert "pg_dump" not in invoked
    assert "alembic" not in invoked


def test_environment_process_counts_are_coerced_and_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.db.connection_policy import DatabaseDeploymentSettings

    monkeypatch.setenv("DB_API_PROCESSES", "1")
    monkeypatch.setenv("DB_WORKER_PROCESSES", "1")
    assert DatabaseDeploymentSettings(_env_file=None).deployment_ceiling == 60
    monkeypatch.setenv("DB_API_PROCESSES", "2")
    with pytest.raises(ValidationError):
        DatabaseDeploymentSettings(_env_file=None)


def test_invalid_runtime_budget_fails_before_engine_construction() -> None:
    import os
    import subprocess
    import sys

    environment: dict[str, str] = dict(os.environ)
    environment["DB_CONNECTION_BUDGET"] = "59"
    program: str = "import sqlalchemy.ext.asyncio\nfrom typing import Any\ndef forbidden_engine(*args: Any, **kwargs: Any) -> Any:\n    raise RuntimeError('ENGINE_CONSTRUCTED')\nsqlalchemy.ext.asyncio.create_async_engine = forbidden_engine\nimport app.db.session\n"
    result: subprocess.CompletedProcess[str] = subprocess.run([sys.executable, "-c", program], env=environment, capture_output=True, text=True, timeout=10)
    assert result.returncode != 0
    assert "exceed the deployment database budget" in result.stderr
    assert "ENGINE_CONSTRUCTED" not in result.stderr
    assert environment["JWT_SECRET_KEY"] not in result.stderr
