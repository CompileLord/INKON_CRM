import asyncio
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Mapping
from uuid import uuid4

import asyncpg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.script.base import Script
from sqlalchemy.engine import URL, make_url


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
WORKFLOW_PATH: Path = BACKEND_ROOT.parent / "deploy/backend.env.example"


class ConfigurationProbe:
    def __init__(self, clean_directory: Path) -> None:
        self.backend_root: Path = BACKEND_ROOT
        self.clean_directory: Path = clean_directory

    def environment(self, values: Mapping[str, str]) -> dict[str, str]:
        return {
            "PATH": os.environ["PATH"],
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(self.backend_root),
            **({"PGSSLMODE": os.environ["PGSSLMODE"]} if "PGSSLMODE" in os.environ else {}),
            **values,
        }

    def run_python(
        self,
        script: str,
        values: Mapping[str, str],
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-c", script],
            cwd=self.clean_directory,
            env=self.environment(values),
            capture_output=True,
            text=True,
            check=False,
        )

    def run_alembic(
        self,
        values: Mapping[str, str],
        offline: bool,
        revision: str = "head",
    ) -> subprocess.CompletedProcess[str]:
        arguments: list[str] = [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            str(self.backend_root / "alembic.ini"),
            "upgrade",
            revision,
        ]
        if offline:
            arguments.append("--sql")
        return subprocess.run(
            arguments,
            cwd=self.clean_directory,
            env=self.environment(values),
            capture_output=True,
            text=True,
            check=False,
        )

    def migration_heads(self) -> set[str]:
        alembic_configuration: Config = Config(str(self.backend_root / "alembic.ini"))
        migration_scripts: ScriptDirectory = ScriptDirectory.from_config(alembic_configuration)
        return set(migration_scripts.get_heads())

    def offline_renderable_revision(self) -> str:
        alembic_configuration: Config = Config(str(self.backend_root / "alembic.ini"))
        migration_scripts: ScriptDirectory = ScriptDirectory.from_config(alembic_configuration)
        current_heads: list[str] = migration_scripts.get_heads()
        assert len(current_heads) == 1, "offline initialization expects a linear current migration head"
        historical_revision: Script | None = migration_scripts.get_revision("c9e3f0a1b2c4")
        assert historical_revision is not None
        return historical_revision.revision


class MigrationDatabaseProbe:
    def __init__(self, source_url: str) -> None:
        parsed_url: URL = make_url(source_url)
        self.source_url: URL = parsed_url
        self.admin_dsn: str = parsed_url.set(database="postgres").render_as_string(
            hide_password=False
        ).replace(
            "+asyncpg", "", 1
        )

    async def create(self, database_name: str, username: str, password: str) -> None:
        connection: asyncpg.Connection = await asyncpg.connect(self.admin_dsn)
        try:
            escaped_password: str = password.replace("'", "''")
            await connection.execute(
                f'CREATE ROLE "{username}" LOGIN PASSWORD \'{escaped_password}\''
            )
            await connection.execute(f'CREATE DATABASE "{database_name}" OWNER "{username}"')
        finally:
            await connection.close()

    async def drop(self, database_name: str, username: str) -> None:
        connection: asyncpg.Connection = await asyncpg.connect(self.admin_dsn)
        try:
            await connection.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
            await connection.execute(f'DROP ROLE IF EXISTS "{username}"')
        finally:
            await connection.close()

    def migration_url(self, database_name: str, username: str, password: str) -> URL:
        return self.source_url.set(
            username=username,
            password=password,
            database=database_name,
        )

    async def verify_password_required(self, username: str, password: str, database_name: str) -> bool:
        invalid_url: str = self.migration_url(
            database_name,
            username,
            f"{password}-invalid",
        ).render_as_string(hide_password=False).replace("+asyncpg", "", 1)
        try:
            connection: asyncpg.Connection = await asyncpg.connect(invalid_url)
        except asyncpg.InvalidPasswordError:
            return True
        else:
            await connection.close()
            return False

    async def verify_migration_head_and_schema(
        self,
        database_name: str,
        username: str,
        password: str,
        expected_heads: set[str],
    ) -> bool:
        dsn: str = self.migration_url(
            database_name,
            username,
            password,
        ).render_as_string(hide_password=False).replace("+asyncpg", "", 1)
        connection: asyncpg.Connection = await asyncpg.connect(dsn)
        try:
            versions: set[str] = set(
                await connection.fetchval("SELECT array_agg(version_num) FROM alembic_version")
            )
            users_table_exists: bool = await connection.fetchval(
                "SELECT to_regclass('public.users') IS NOT NULL"
            )
            return versions == expected_heads and users_table_exists
        finally:
            await connection.close()


@pytest.fixture
def configuration_probe(tmp_path: Path) -> ConfigurationProbe:
    return ConfigurationProbe(tmp_path)


def test_configuration_probe_uses_pytest_managed_temporary_directory(
    configuration_probe: ConfigurationProbe,
    tmp_path: Path,
) -> None:
    assert configuration_probe.clean_directory == tmp_path
    assert configuration_probe.clean_directory.is_dir()
    assert os.access(configuration_probe.clean_directory, os.W_OK)


def workflow_environment_names() -> set[str]:
    environment_template: str = WORKFLOW_PATH.read_text()
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", environment_template, re.MULTILINE))


def synthetic_workflow_values() -> dict[str, str]:
    values: dict[str, str] = {
        "ENVIRONMENT": "production",
        "OUTBOX_ENCRYPTION_KEYS": f"v1:{'11' * 32}",
        "DATABASE_URL": "postgresql+asyncpg://wp11_probe:synthetic-only@localhost:5432/wp11_probe",
        "REDIS_URL": "redis://localhost:6379/15",
        "JWT_SECRET_KEY": "synthetic-wp11-jwt-not-a-secret",
        "JWT_REFRESH_SECRET_KEY": "synthetic-wp11-refresh-not-a-secret",
        "SMTP_HOST": "mail.example.invalid",
        "SMTP_PORT": "587",
        "SMTP_USER": "synthetic@example.invalid",
        "SMTP_PASSWORD": "synthetic-wp11-smtp-not-a-secret",
        "SMTP_FROM_EMAIL": "synthetic@example.invalid",
        "TELEGRAM_BOT_TOKEN": "123456789:synthetic-wp11-token",
        "TELEGRAM_BOT_SECRET_TOKEN": "synthetic-wp11-telegram-not-a-secret",
        "TELEGRAM_WEBHOOK_URL": "https://hooks.example.com/api/v1/telegram/webhook",
        "CRON_SECRET": "synthetic-wp11-cron-not-a-secret",
        "BACKEND_CORS_ORIGINS": "[]",
    }
    return values


def synthetic_values_with_legacy_database_fields() -> dict[str, str]:
    values: dict[str, str] = synthetic_workflow_values()
    values.update(
        {
            "POSTGRES_SERVER": "localhost",
            "POSTGRES_USER": "wp11_probe",
            "POSTGRES_PASSWORD": "synthetic-wp11-not-a-secret",
            "POSTGRES_DB": "wp11_probe",
            "POSTGRES_PORT": "5432",
        }
    )
    return values


def test_deployment_variable_names_satisfy_settings_without_dotenv(
    configuration_probe: ConfigurationProbe,
) -> None:
    expected_names: set[str] = {
        "ENVIRONMENT",
        "DATABASE_URL",
        "REDIS_URL",
        "JWT_SECRET_KEY",
        "JWT_REFRESH_SECRET_KEY",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_BOT_SECRET_TOKEN",
        "TELEGRAM_WEBHOOK_URL",
        "CRON_SECRET",
        "BACKEND_CORS_ORIGINS",
    }
    assert expected_names <= workflow_environment_names()

    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        synthetic_workflow_values(),
    )

    assert result.returncode == 0, "workflow-provided names must initialize settings without .env"
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_split_postgres_fields_do_not_substitute_for_database_url(
    configuration_probe: ConfigurationProbe,
) -> None:
    values: dict[str, str] = synthetic_workflow_values()
    values.pop("DATABASE_URL")
    values.update(
        {
            "POSTGRES_SERVER": "localhost",
            "POSTGRES_USER": "synthetic-only",
            "POSTGRES_PASSWORD": "synthetic-wp11-not-a-secret",
            "POSTGRES_DB": "wp11_probe",
        }
    )
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        values,
    )

    assert result.returncode != 0
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_alembic_offline_initialization_needs_only_database_url(
    configuration_probe: ConfigurationProbe,
) -> None:
    database_url: str = "postgresql+asyncpg://wp11_probe:synthetic-only@localhost:5432/wp11_probe"
    result: subprocess.CompletedProcess[str] = configuration_probe.run_alembic(
        {"DATABASE_URL": database_url},
        offline=True,
        revision=configuration_probe.offline_renderable_revision(),
    )

    assert result.returncode == 0, "offline migrations must initialize from database configuration alone"
    assert "CREATE TABLE" in result.stdout
    assert "synthetic-only" not in result.stdout
    assert "synthetic-only" not in result.stderr


def test_alembic_online_initialization_needs_only_database_url(
    configuration_probe: ConfigurationProbe,
) -> None:
    source_url: str = os.environ["DATABASE_URL"]
    database_name: str = f"wp11_migration_{uuid4().hex}"
    username: str = f"wp11_role_{uuid4().hex}"
    password: str = "wp11%encoded@credential"
    migration_database: MigrationDatabaseProbe = MigrationDatabaseProbe(source_url)
    expected_heads: set[str] = configuration_probe.migration_heads()
    asyncio.run(migration_database.create(database_name, username, password))

    try:
        assert asyncio.run(
            migration_database.verify_password_required(username, password, database_name)
        ), "the disposable migration database must require the generated password"
        migration_url: URL = migration_database.migration_url(database_name, username, password)
        result: subprocess.CompletedProcess[str] = configuration_probe.run_alembic(
            {"DATABASE_URL": migration_url.render_as_string(hide_password=False)},
            offline=False,
        )
        assert result.returncode == 0, "online migrations must initialize from database configuration alone"
        assert "synthetic" not in result.stdout
        assert "synthetic" not in result.stderr
        assert asyncio.run(
            migration_database.verify_migration_head_and_schema(
                database_name,
                username,
                password,
                expected_heads,
            )
        ), "online migrations must reach the expected revision and create the user schema"
    finally:
        asyncio.run(migration_database.drop(database_name, username))


@pytest.mark.parametrize(
    "webhook_url",
    [
        "http://localhost:8000/api/v1/telegram/webhook",
        "https://127.0.0.1/api/v1/telegram/webhook",
        "https://10.20.30.40/api/v1/telegram/webhook",
        "https://192.168.1.20/api/v1/telegram/webhook",
        "https://[::1]/api/v1/telegram/webhook",
        "https://localhost.localdomain/api/v1/telegram/webhook",
        "https://bad host.example.com/api/v1/telegram/webhook",
        "https://-bad.example.com/api/v1/telegram/webhook",
        "https://intranet/api/v1/telegram/webhook",
        "https://hooks.example.com:99999/api/v1/telegram/webhook",
        "https://hooks.example.com:0/api/v1/telegram/webhook",
        "https://hooks.example.com:wrong/api/v1/telegram/webhook",
        "https://hooks.example.com../api/v1/telegram/webhook",
    ],
)
def test_live_telegram_rejects_nonpublic_webhook_urls(
    configuration_probe: ConfigurationProbe,
    webhook_url: str,
) -> None:
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        {
            **synthetic_values_with_legacy_database_fields(),
            "TELEGRAM_WEBHOOK_URL": webhook_url,
        },
    )

    assert result.returncode != 0, "live Telegram must reject a nonpublic webhook URL"
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_testing_configuration_preserves_local_telegram_webhook_behavior(
    configuration_probe: ConfigurationProbe,
) -> None:
    values: dict[str, str] = synthetic_values_with_legacy_database_fields()
    values["TESTING"] = "true"
    values["ENVIRONMENT"] = "testing"
    values["TELEGRAM_WEBHOOK_URL"] = "http://localhost:8000/api/v1/telegram/webhook"
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        values,
    )

    assert result.returncode == 0
    assert result.stdout.strip() == "LOADED"
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_live_development_configuration_rejects_local_telegram_webhook(
    configuration_probe: ConfigurationProbe,
) -> None:
    values: dict[str, str] = synthetic_workflow_values()
    values["ENVIRONMENT"] = "development"
    values["TELEGRAM_WEBHOOK_URL"] = "http://localhost:8000/api/v1/telegram/webhook"
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        values,
    )

    assert result.returncode != 0
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_enabled_telegram_accepts_public_https_webhook(
    configuration_probe: ConfigurationProbe,
) -> None:
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        "from app.core.config import settings; print('LOADED')",
        synthetic_workflow_values(),
    )

    assert result.returncode == 0
    assert result.stdout.strip() == "LOADED"
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr


def test_invalid_webhook_errors_redact_embedded_credentials_and_secrets(
    configuration_probe: ConfigurationProbe,
) -> None:
    scripts: str = """
from app.core.config import settings
print('LOADED')
"""
    redaction_user: str = "redaction-" + "user"
    redaction_password: str = "redaction-" + "password"
    redaction_query_secret: str = "redaction-query-" + "secret"
    rejected_urls: tuple[str, ...] = (
        f"https://{redaction_user}:{redaction_password}@hooks.example.com/api/v1/telegram/webhook",
        f"https://hooks.example.com/api/v1/telegram/webhook?token={redaction_query_secret}",
    )

    for webhook_url in rejected_urls:
        result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
            scripts,
            {**synthetic_workflow_values(), "TELEGRAM_WEBHOOK_URL": webhook_url},
        )
        output: str = f"{result.stdout}{result.stderr}"
        secret_leaked: bool = any(
            marker in output
            for marker in (redaction_user, redaction_password, redaction_query_secret)
        )
        assert result.returncode != 0
        assert not secret_leaked, "invalid webhook errors must redact embedded secrets"


def test_production_lifespan_closes_local_resources_with_workflow_settings(
    configuration_probe: ConfigurationProbe,
) -> None:
    script: str = """
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock
import app.telegram_bot.bot as telegram_bot
import app.core.redis as redis_module
from app.core.config import settings
from app.main import app

set_webhook = AsyncMock()
delete_webhook = AsyncMock()
close_bot_session = AsyncMock()
close_arq_pool = AsyncMock()
telegram_bot.bot.set_webhook = set_webhook
telegram_bot.bot.delete_webhook = delete_webhook
telegram_bot.bot.session.close = close_bot_session
redis_module.close_arq_pool = close_arq_pool
with TestClient(app):
    pass

if set_webhook.await_count != 0 or delete_webhook.await_count != 0:
    raise SystemExit('LIFESPAN_WEBHOOK_OWNERSHIP_MISMATCH')
if close_bot_session.await_count != 1 or close_arq_pool.await_count != 1:
    raise SystemExit('LIFESPAN_LOCAL_CLEANUP_MISMATCH')
if settings.ENVIRONMENT != 'production' or settings.TELEGRAM_WEBHOOK_URL != 'https://hooks.example.com/api/v1/telegram/webhook' or not settings.TELEGRAM_BOT_SECRET_TOKEN:
    raise SystemExit('LIFESPAN_MISMATCH')
print('LIFESPAN_LOCAL_CLEANUP_MATCHED')
"""
    result: subprocess.CompletedProcess[str] = configuration_probe.run_python(
        script,
        synthetic_workflow_values(),
    )

    assert result.returncode == 0
    assert result.stdout.strip() == "LIFESPAN_LOCAL_CLEANUP_MATCHED"
    assert "synthetic" not in result.stdout
    assert "synthetic" not in result.stderr
