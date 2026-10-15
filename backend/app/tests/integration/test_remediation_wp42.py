import os
import subprocess
import sys
from pathlib import Path


class MigrationWorkflowContract:
    def __init__(self, workflow_path: Path) -> None:
        self.workflow_text: str = workflow_path.read_text(encoding="utf-8")

    def job_section(self, job_name: str, following_job_name: str) -> str:
        job_marker: str = f"\n  {job_name}:\n"
        following_marker: str = f"\n  {following_job_name}:\n"
        assert job_marker in self.workflow_text
        job_contents: str = self.workflow_text.split(job_marker, 1)[1]
        return job_contents.split(following_marker, 1)[0]

    def job_environment(self, job_name: str, following_job_name: str) -> dict[str, str]:
        job_lines: list[str] = self.job_section(job_name, following_job_name).splitlines()
        if "    env:" not in job_lines:
            return {}
        environment_start: int = job_lines.index("    env:") + 1
        environment: dict[str, str] = {}
        for environment_line in job_lines[environment_start:]:
            if not environment_line.startswith("      "):
                break
            key, value = environment_line.strip().split(":", 1)
            environment[key] = value.strip().strip("'\"")
        return environment


def test_workflow_requires_network_migration_job_before_image_deployment() -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    contract: MigrationWorkflowContract = MigrationWorkflowContract(
        backend_root.parent / ".github" / "workflows" / "deploy-backend.yml"
    )
    migration_job: str = contract.job_section("migrate", "deploy")
    deployment_job: str = contract.workflow_text.split("\n  deploy:\n", 1)[1]

    assert "needs: test" in migration_job
    assert "runs-on: [self-hosted, linux, migration-network]" in migration_job
    assert "DATABASE_URL: ${{ secrets.DATABASE_URL }}" in migration_job
    assert 'if [ -z "${DATABASE_URL:-}" ]' in migration_job
    assert "alembic upgrade head" in migration_job
    assert "alembic upgrade head ||" not in migration_job
    assert "continue-on-error: true" not in migration_job
    assert "needs: [test, migrate]" in deployment_job
    assert "Build and push container image" in deployment_job
    assert "deploy-cloudrun@v3" in deployment_job


def test_workflow_test_job_defines_dedicated_synthetic_configuration_and_tools() -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    contract: MigrationWorkflowContract = MigrationWorkflowContract(
        backend_root.parent / ".github" / "workflows" / "deploy-backend.yml"
    )
    test_job: str = contract.job_section("test", "migrate")
    environment: dict[str, str] = contract.job_environment("test", "migrate")

    assert environment["ENVIRONMENT"] == "testing"
    assert environment["TESTING"] == "true"
    assert environment["TEST_DATABASE_URL"] == environment["DATABASE_URL"]
    assert environment["TEST_DATABASE_URL"].endswith("@localhost:5432/imkon_test_db")
    assert environment["TEST_REDIS_URL"] == environment["REDIS_URL"]
    assert environment["TEST_REDIS_URL"] == "redis://localhost:6379/15"
    assert environment["JWT_SECRET_KEY"].startswith("test-only-")
    assert environment["JWT_REFRESH_SECRET_KEY"].startswith("test-only-")
    assert environment["SMTP_HOST"].endswith(".invalid")
    assert environment["SMTP_USER"].endswith(".invalid")
    assert environment["SMTP_PASSWORD"].startswith("test-only-")
    assert environment["SMTP_FROM_EMAIL"].endswith(".invalid")
    bot_token_identifier, bot_token_secret = environment["TELEGRAM_BOT_TOKEN"].split(":", 1)
    assert bot_token_identifier == "123456789"
    assert len(bot_token_secret) == 35
    assert environment["TELEGRAM_BOT_SECRET_TOKEN"].startswith("test-only-")
    assert "Install isolated Redis and TLS test tools" in test_job
    assert "sudo apt-get install --no-install-recommends --yes redis-server openssl" in test_job
    assert "command -v redis-server" in test_job
    assert "command -v openssl" in test_job


def test_workflow_test_environment_collects_without_local_env_or_inherited_secrets(tmp_path: Path) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    contract: MigrationWorkflowContract = MigrationWorkflowContract(
        backend_root.parent / ".github" / "workflows" / "deploy-backend.yml"
    )
    subprocess_environment: dict[str, str] = {
        "HOME": str(tmp_path),
        "PATH": os.environ["PATH"],
        "PYTHONPATH": str(backend_root),
        "PYTHONDONTWRITEBYTECODE": "1",
        "TMPDIR": str(tmp_path),
    }
    subprocess_environment.update(contract.job_environment("test", "migrate"))
    collection_result: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            str(backend_root / "app" / "tests"),
            "--collect-only",
            "-q",
            "-p",
            "no:cacheprovider",
        ],
        cwd=tmp_path,
        env=subprocess_environment,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert collection_result.returncode == 0, collection_result.stdout + collection_result.stderr
    assert "tests collected" in collection_result.stdout.lower()
