from __future__ import annotations

import json
import os
import pty
import select as select_module
import secrets
import io
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from scripts.reset_guard import STORAGE_MARKER_NAME, STORAGE_MARKER_VERSION, ResetGuardError, ResetTargetGuard
def make_guard(backend_root: Path, database_url: str = "postgresql+asyncpg://seed_user:seed_password@localhost:5432/imkon_test_db", environment: str = "testing", storage_path: str | None = None):
    from scripts.reset_guard import STORAGE_MARKER_NAME, STORAGE_MARKER_VERSION, ResetTargetGuard
    backend_root.mkdir(parents=True, exist_ok=True)
    selected_storage_path: str = storage_path or str(backend_root / "storage")
    selected_storage_root: Path = Path(selected_storage_path)
    if not selected_storage_root.is_absolute():
        selected_storage_root = backend_root / selected_storage_root
    selected_storage_root.mkdir(parents=True, exist_ok=True)
    database_name: str = database_url.rsplit("/", maxsplit=1)[-1].split("?", maxsplit=1)[0].split("#", maxsplit=1)[0]
    marker_database_identity: str = f"localhost:5432/{database_name}"
    marker_path: Path = selected_storage_root / STORAGE_MARKER_NAME
    marker_path.write_text(
        f"{STORAGE_MARKER_VERSION}\n{marker_database_identity}\n",
        encoding="utf-8",
    )
    return ResetTargetGuard(
        environment=environment,
        database_url=database_url,
        storage_path=selected_storage_path,
        backend_root=backend_root,
    )


def reset_arguments(backend_root: Path, database_identity: str = "localhost:5432/imkon_test_db", storage_path: Path | None = None) -> list[str]:
    selected_storage_path: Path = storage_path or backend_root / "storage"
    return [
        "--reset",
        "--expected-database",
        database_identity,
        "--expected-storage",
        str(selected_storage_path),
    ]


@pytest.mark.parametrize("module_name", ["scripts.clean_db", "scripts.seed_demo_data"])
@pytest.mark.parametrize("scenario", ["missing-reset", "production", "wrong-database", "missing-storage"])
def test_actual_cli_refuses_unsafe_target_without_destructive_effects(module_name: str, scenario: str, tmp_path: Path) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    probe_code: str = '''
import asyncio, json, runpy, shutil, sys
import app.db.session as database
events = []
class Connection:
    async def execute(self, statement): events.append("database_truncate")
class Transaction:
    async def __aenter__(self): return Connection()
    async def __aexit__(self, *args): return False
class Engine:
    def begin(self): return Transaction()
class Session:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return False
    def add(self, value): pass
    def add_all(self, values): pass
    async def flush(self): raise RuntimeError("stop before any external work")
    async def commit(self): pass
database.engine = Engine()
database.AsyncSessionLocal = lambda: Session()
shutil.rmtree = lambda *args, **kwargs: events.append("storage_delete")
module_name = sys.argv[2]
sys.argv = [module_name, *json.loads(sys.argv[1])]
exit_code = 0
try:
    runpy.run_module(module_name, run_name="__main__")
except SystemExit as error:
    exit_code = error.code if isinstance(error.code, int) else 1
except Exception:
    exit_code = 1
print("WP10_PROBE=" + json.dumps({"exit_code": exit_code, "events": events}))
'''
    environment: dict[str, str] = os.environ.copy()
    environment.update({
        "ENVIRONMENT": "production" if scenario == "production" else "testing",
        "TESTING": "false" if scenario == "production" else "true",
        "OUTBOX_ENCRYPTION_KEYS": f"v1:{'11' * 32}",
        "TELEGRAM_WEBHOOK_URL": "https://hooks.example.com/api/v1/telegram/webhook",
        "DATABASE_URL": "postgresql+asyncpg://wp10:wp10@localhost:1/imkon_test_db",
        "POSTGRES_SERVER": "localhost",
        "POSTGRES_PORT": "1",
        "POSTGRES_USER": "wp10",
        "POSTGRES_PASSWORD": "wp10",
        "POSTGRES_DB": "imkon_test_db",
        "STORAGE_PATH": str(tmp_path / "missing-storage"),
    })
    expected_database: str = "localhost:1/imkon_prod" if scenario == "wrong-database" else "localhost:1/imkon_test_db"
    arguments: list[str] = ["--expected-database", expected_database, "--expected-storage", str(tmp_path / "missing-storage")]
    if scenario != "missing-reset":
        arguments.append("--reset")
    process: subprocess.CompletedProcess[str] = subprocess.run(
        [sys.executable, "-c", probe_code, json.dumps(arguments), module_name],
        cwd=backend_root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    probe_line: str = next(line for line in process.stdout.splitlines() if line.startswith("WP10_PROBE="))
    probe_result: dict[str, object] = json.loads(probe_line.removeprefix("WP10_PROBE="))
    assert probe_result == {"exit_code": 2, "events": []}
    assert "Traceback" not in process.stderr


def test_reset_guard_requires_explicit_reset_confirmation(tmp_path: Path) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path)

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate([
            "--expected-database",
            "localhost:5432/imkon_test_db",
            "--expected-storage",
            str(tmp_path / "storage"),
        ])


def test_reset_guard_refuses_production_before_returning_a_target(tmp_path: Path) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path, environment="production")

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(tmp_path))


def test_reset_guard_rejects_database_identity_mismatch(tmp_path: Path) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path)

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(tmp_path, "localhost:5432/imkon_prod"))


@pytest.mark.parametrize("database_name", ["production_latest", "contest"])
def test_reset_guard_rejects_names_that_only_contain_test(tmp_path: Path, database_name: str) -> None:
    database_url: str = f"postgresql+asyncpg://seed_user:seed_password@localhost:5432/{database_name}"
    guard: ResetTargetGuard = make_guard(tmp_path, database_url=database_url)

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(tmp_path, f"localhost:5432/{database_name}"))


def test_reset_guard_rejects_storage_identity_mismatch(tmp_path: Path) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path)

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(tmp_path, storage_path=tmp_path / "other-storage"))


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql+asyncpg://seed_user:seed_password@localhost:5432/imkon_test_db?host=remote.example",
        "postgresql+asyncpg://seed_user:seed_password@localhost:5432/imkon_test_db#other-target",
        "postgresql+asyncpg://seed_user:seed_password@192.0.2.20:5432/imkon_test_db",
    ],
)
def test_reset_guard_rejects_overridden_or_remote_database_target(tmp_path: Path, database_url: str) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path, database_url=database_url)

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(tmp_path))


def test_reset_guard_refuses_storage_symlinks(tmp_path: Path) -> None:
    backend_root: Path = tmp_path / "backend"
    backend_root.mkdir()
    outside_storage: Path = tmp_path / "valuable-storage"
    outside_storage.mkdir()
    storage_link: Path = backend_root / "storage"
    storage_link.symlink_to(outside_storage, target_is_directory=True)
    guard: ResetTargetGuard = make_guard(backend_root, storage_path=str(storage_link))

    with pytest.raises(ResetGuardError):
        guard.parse_and_validate(reset_arguments(backend_root, storage_path=storage_link))


def test_dry_run_returns_only_non_secret_target_metadata(tmp_path: Path) -> None:
    guard: ResetTargetGuard = make_guard(tmp_path)
    arguments: list[str] = reset_arguments(tmp_path) + ["--dry-run"]

    target = guard.parse_and_validate(arguments)

    assert target.database_identity == "localhost:5432/imkon_test_db"
    assert target.storage_root == (tmp_path / "storage").resolve()
    assert target.dry_run is True
    assert "seed_password" not in repr(target)


def test_clean_database_entrypoint_refuses_before_database_access(monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import clean_db

    called: list[bool] = []
    monkeypatch.setattr(clean_db.asyncio, "run", lambda coroutine: called.append(True))

    with pytest.raises(SystemExit):
        clean_db.main(["--expected-database", "localhost:5432/imkon_test_db", "--expected-storage", settings.STORAGE_PATH])

    assert called == []


def test_demo_seed_entrypoint_refuses_before_database_or_storage_access(monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import seed_demo_data

    called: list[bool] = []
    monkeypatch.setattr(seed_demo_data.asyncio, "run", lambda coroutine: called.append(True))

    with pytest.raises(SystemExit):
        seed_demo_data.main([
            "--reset",
            "--expected-database",
            "wrong:5432/imkon_test_db",
            "--expected-storage",
            settings.STORAGE_PATH,
        ])

    assert called == []


@pytest.mark.parametrize("script_name", ["clean_db", "seed_demo_data"])
def test_reset_entrypoint_never_writes_provisioned_credentials_to_output(
    script_name: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    from scripts import clean_db, seed_demo_data

    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
    selected_script = clean_db if script_name == "clean_db" else seed_demo_data
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    credential_values: dict[str, str] = {
        "administrator": secrets.token_urlsafe(24),
        "demo users": secrets.token_urlsafe(24),
    }

    class FakeProvisioner:
        def provision(self, labels: list[str]) -> dict[str, str]:
            return {label: credential_values[label] for label in labels}

    def close_coroutine(coroutine: object) -> None:
        coroutine.close()

    monkeypatch.setattr(selected_script, "create_reset_guard", lambda: guard)
    monkeypatch.setattr(selected_script, "CredentialProvisioner", FakeProvisioner)
    monkeypatch.setattr(selected_script.asyncio, "run", close_coroutine)
    selected_script.main(reset_arguments(tmp_path / "backend"))

    captured_output = capsys.readouterr()
    output: str = captured_output.out + captured_output.err + caplog.text
    assert all(password not in output for password in credential_values.values())
    assert "reset completed" in output.lower()


def test_credential_provisioner_fails_closed_before_getpass_fallback_reads_input(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import getpass

    input_stream: io.StringIO = io.StringIO("sensitive temporary password\n")
    fallback_reads: list[str] = []
    original_raw_input = getpass._raw_input

    def record_fallback_read(
        prompt: str,
        stream: object | None = None,
        input_stream: object | None = None,
        *,
        echo_char: str | None = None,
    ) -> str:
        fallback_reads.append(prompt)
        return original_raw_input(prompt, stream, input=input_stream, echo_char=echo_char)

    monkeypatch.setattr(sys, "stdin", input_stream)
    monkeypatch.setattr(getpass, "_raw_input", record_fallback_read)
    from scripts.reset_guard import CredentialProvisioner

    with pytest.raises(ResetGuardError, match="Interactive credential provisioning failed") as error:
        CredentialProvisioner().provision(["administrator"])

    assert fallback_reads == []
    assert input_stream.tell() == 0
    assert "sensitive temporary password" not in str(error.value)


def test_credential_provisioner_uses_getpass_on_a_secure_terminal() -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    temporary_password: str = secrets.token_urlsafe(24)
    child_code: str = (
        "from scripts.reset_guard import CredentialProvisioner; "
        "CredentialProvisioner().provision(['administrator']); "
        "print('secure-provisioning-complete')"
    )
    master_descriptor, slave_descriptor = pty.openpty()
    process: subprocess.Popen[bytes] = subprocess.Popen(
        [sys.executable, "-c", child_code],
        cwd=backend_root,
        stdin=slave_descriptor,
        stdout=slave_descriptor,
        stderr=slave_descriptor,
        start_new_session=True,
    )
    os.close(slave_descriptor)
    terminal_output: bytearray = bytearray()
    supplied_prompts: int = 0
    try:
        while process.poll() is None:
            readable, _, _ = select_module.select([master_descriptor], [], [], 5)
            if not readable:
                raise AssertionError(f"Secure terminal credential prompt timed out: {terminal_output!r}")
            try:
                terminal_output.extend(os.read(master_descriptor, 4096))
            except OSError:
                break
            prompt_count: int = (
                terminal_output.count(b"Temporary password for administrator:")
                + terminal_output.count(b"Confirm temporary password for administrator:")
            )
            while supplied_prompts < prompt_count:
                os.write(master_descriptor, f"{temporary_password}\n".encode())
                supplied_prompts += 1
        exit_code: int = process.wait(timeout=5)
        while select_module.select([master_descriptor], [], [], 0)[0]:
            try:
                terminal_output.extend(os.read(master_descriptor, 4096))
            except OSError:
                break
    finally:
        os.close(master_descriptor)
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)

    assert exit_code == 0
    assert b"secure-provisioning-complete" in terminal_output
    assert temporary_password.encode() not in terminal_output


@pytest.mark.parametrize("script_filename", ["clean_db.py", "seed_demo_data.py"])
def test_script_cli_requires_reset_before_any_configured_database_connection(
    script_filename: str,
) -> None:
    backend_root: Path = Path(__file__).resolve().parents[3]
    script_module: str = f"scripts.{Path(script_filename).stem}"
    isolated_environment: dict[str, str] = os.environ.copy()
    isolated_environment.update({
        "ENVIRONMENT": "testing",
        "POSTGRES_SERVER": "localhost",
        "POSTGRES_PORT": "1",
        "POSTGRES_USER": "wp10-invalid",
        "POSTGRES_PASSWORD": "wp10-invalid",
        "POSTGRES_DB": "imkon_test_db",
        "DATABASE_URL": "postgresql+asyncpg://wp10-invalid:wp10-invalid@localhost:1/imkon_test_db",
    })

    process: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-m",
            script_module,
            "--expected-database",
            "localhost:1/imkon_test_db",
            "--expected-storage",
            settings.STORAGE_PATH,
        ],
        cwd=backend_root,
        env=isolated_environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    assert process.returncode == 2
    assert "Explicit --reset confirmation is required" in process.stderr
    assert "wp10-invalid" not in process.stdout + process.stderr


@pytest.mark.parametrize("script_name", ["clean_db", "seed_demo_data"])
def test_reset_entrypoint_dry_run_does_not_start_database_or_download_work(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    script_name: str,
) -> None:
    from scripts import clean_db, seed_demo_data

    selected_script = clean_db if script_name == "clean_db" else seed_demo_data
    guard: ResetTargetGuard = make_guard(tmp_path)
    monkeypatch.setattr(selected_script, "create_reset_guard", lambda: guard)
    monkeypatch.setattr(selected_script.asyncio, "run", lambda coroutine: pytest.fail("dry-run started work"))

    selected_script.main(reset_arguments(tmp_path) + ["--dry-run"])

    dry_run_output: str = capsys.readouterr().out
    assert "database=localhost:5432/imkon_test_db" in dry_run_output
    assert "storage=" in dry_run_output
    assert "seed_password" not in dry_run_output

