from __future__ import annotations

import json
import os
import pty
import re
import select
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import pytest


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
SETUP_SCRIPT_PATH: Path = BACKEND_ROOT / "scripts/setup_free_tier_vm.sh"
ADMIN_SCRIPT_PATH: Path = BACKEND_ROOT / "scripts/seed_admin.py"
ADMIN_PROBE_SOURCE: str = '''
import builtins
import json
import runpy
import sys
import types
from pathlib import Path
from typing import Any, Iterator

class Query:
    def filter(self, expression: Any) -> "Query":
        return self

class Result:
    def scalars(self) -> "Result":
        return self

    def first(self) -> None:
        return None

class Session:
    async def __aenter__(self) -> "Session":
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def execute(self, query: Any) -> Result:
        database_error: str | None = probe_data.get("database_error")
        if database_error is not None:
            raise RuntimeError(database_error)
        return Result()

    def add(self, user: Any) -> None:
        return None

    async def commit(self) -> None:
        return None

class User:
    email: object = object()

    def __init__(self, **values: Any) -> None:
        self.values: dict[str, Any] = values

class UserRole:
    SUPERADMIN: str = "superadmin"

def hash_password(password: str) -> str:
    return "hashed"

def select(model: Any) -> Query:
    return Query()

def read_input(prompt: str = "") -> str:
    return next(interactive_inputs)

def read_password(prompt: str = "") -> str:
    return next(interactive_inputs)

database_module = types.ModuleType("app.db.session")
database_module.AsyncSessionLocal = Session
models_module = types.ModuleType("app.models.user")
models_module.User = User
models_module.UserRole = UserRole
security_module = types.ModuleType("app.core.security")
security_module.hash_password = hash_password
sqlalchemy_module = types.ModuleType("sqlalchemy")
sqlalchemy_module.select = select
sys.modules["app.db.session"] = database_module
sys.modules["app.models.user"] = models_module
sys.modules["app.core.security"] = security_module
sys.modules["sqlalchemy"] = sqlalchemy_module
probe_data: dict[str, Any] = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
admin_arguments: list[str] = probe_data["arguments"]
interactive_inputs: Iterator[str] = iter(probe_data["interactive_inputs"])
builtins.input = read_input
import getpass
getpass.getpass = read_password
sys.argv = [sys.argv[1], *admin_arguments]
try:
    runpy.run_path(sys.argv[0], run_name="__main__")
except SystemExit as exit_status:
    if exit_status.code not in (None, 0):
        raise
print("WP47_ARGV=" + json.dumps(sys.argv))
'''
ADMIN_PTY_PROBE_SOURCE: str = ADMIN_PROBE_SOURCE.replace(
    "builtins.input = read_input\nimport getpass\ngetpass.getpass = read_password\n",
    "import getpass\n",
)


def run_isolated_setup_script(
    temporary_path: Path,
    password_file: Path | None,
    existing_database: bool = False,
) -> subprocess.CompletedProcess[str]:
    isolated_root: Path = temporary_path / "isolated"
    script_directory: Path = isolated_root / "scripts"
    configuration_directory: Path = isolated_root / "config"
    fake_bin_directory: Path = temporary_path / "fake-bin"
    script_directory.mkdir(parents=True)
    configuration_directory.mkdir(parents=True)
    fake_bin_directory.mkdir()
    script_copy: Path = script_directory / "setup_free_tier_vm.sh"
    setup_source: str = SETUP_SCRIPT_PATH.read_text(encoding="utf-8")
    script_copy.write_text(
        setup_source.replace("/var/lib/imkon", str(isolated_root / "var")),
        encoding="utf-8",
    )
    shutil.copy2(BACKEND_ROOT / "config/redis.conf.example", configuration_directory / "redis.conf.example")
    tls_directory: Path = isolated_root / "var/redis_tls"
    tls_directory.mkdir(parents=True)
    (tls_directory / "server.key").write_text("synthetic private key", encoding="utf-8")
    (tls_directory / "server.crt").write_text("synthetic certificate", encoding="utf-8")
    (tls_directory / "ca.crt").write_text("synthetic certificate", encoding="utf-8")
    if existing_database:
        database_directory: Path = isolated_root / "var/postgres_data"
        database_directory.mkdir(parents=True)
        (database_directory / "PG_VERSION").write_text("16", encoding="utf-8")
    container_arguments_path: Path = temporary_path / "container-arguments"
    fake_commands: dict[str, str] = {
        "docker": "#!/usr/bin/env bash\nprintf '%s\\0' \"$@\" >> \"${WP47_CONTAINER_ARGUMENTS}\"\nif [[ \"$*\" == *\"--entrypoint id\"* ]]; then printf '1000'; fi\nif [[ \"$*\" == *\"--name imkon_db\"* ]] && find \"${WP47_POSTGRES_DATA_PATH}\" -mindepth 1 -print -quit | grep -q .; then printf 'PostgreSQL data directory is not empty.\\n' >&2; exit 1; fi\n",
        "chown": "#!/usr/bin/env bash\nexit 0\n",
        "curl": "#!/usr/bin/env bash\nprintf '192.0.2.47'\n",
    }
    for command_name, command_content in fake_commands.items():
        command_path: Path = fake_bin_directory / command_name
        command_path.write_text(command_content, encoding="utf-8")
        command_path.chmod(0o700)
    environment: dict[str, str] = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin_directory}:{environment['PATH']}",
            "REDIS_PASSWORD": "a" * 64,
            "WP47_CONTAINER_ARGUMENTS": str(container_arguments_path),
            "WP47_POSTGRES_DATA_PATH": str(isolated_root / "var/postgres_data"),
        }
    )
    if password_file is None:
        environment.pop("POSTGRES_PASSWORD_FILE", None)
    else:
        environment["POSTGRES_PASSWORD_FILE"] = str(password_file)
    return subprocess.run(
        ["bash", str(script_copy)],
        cwd=BACKEND_ROOT,
        env=environment,
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
    )


def test_vm_setup_uses_restricted_password_file_without_emitting_credentials() -> None:
    setup_source: str = SETUP_SCRIPT_PATH.read_text(encoding="utf-8")

    assert re.search(r"POSTGRES_PASSWORD_FILE=", setup_source)
    assert re.search(r"-e\s+POSTGRES_PASSWORD_FILE=", setup_source)
    assert not re.search(r"-e\s+POSTGRES_PASSWORD=", setup_source)
    assert not re.search(r"echo[^\n]*\$\{POSTGRES_PASSWORD\}", setup_source)
    assert not re.search(r"echo[^\n]*DATABASE_URL[^\n]*POSTGRES_PASSWORD", setup_source)


def test_admin_cli_accepts_password_from_stdin_without_argv_or_output_leak(
    tmp_path: Path,
) -> None:
    arguments: list[str] = [
        "--email",
        "synthetic-admin@example.invalid",
        "--non-interactive",
        "--password-stdin",
    ]
    process: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-c",
            ADMIN_PROBE_SOURCE,
            str(ADMIN_SCRIPT_PATH),
            str(write_probe_data(tmp_path, arguments, [])),
        ],
        cwd=BACKEND_ROOT,
        input="SyntheticAdminSecret-47!\n",
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )

    assert process.returncode == 0, process.stderr
    captured_output: str = process.stdout + process.stderr
    assert "SyntheticAdminSecret-47!" not in captured_output
    assert "SyntheticAdminSecret-47!" not in repr(process.args)
    argv_line: str = next(
        line for line in process.stdout.splitlines() if line.startswith("WP47_ARGV=")
    )
    captured_arguments: list[str] = json.loads(argv_line.removeprefix("WP47_ARGV="))
    assert all("SyntheticAdminSecret-47!" not in argument for argument in captured_arguments)


def test_admin_cli_accepts_password_from_inherited_file_descriptor(
    tmp_path: Path,
) -> None:
    secret_value: str = "FileDescriptorAdminSecret-47!"
    password_path: Path = tmp_path / "admin-password"
    password_path.write_text(secret_value, encoding="utf-8")
    password_descriptor: int = os.open(password_path, os.O_RDONLY)
    arguments: list[str] = [
        "--email",
        "synthetic-admin@example.invalid",
        "--non-interactive",
        "--password-fd",
        str(password_descriptor),
    ]
    try:
        process: subprocess.CompletedProcess[str] = subprocess.run(
            [
                sys.executable,
                "-c",
                ADMIN_PROBE_SOURCE,
                str(ADMIN_SCRIPT_PATH),
                str(write_probe_data(tmp_path, arguments, [])),
            ],
            cwd=BACKEND_ROOT,
            pass_fds=(password_descriptor,),
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
    finally:
        os.close(password_descriptor)

    assert process.returncode == 0, process.stderr
    assert secret_value not in process.stdout + process.stderr
    assert secret_value not in repr(process.args)


def write_probe_data(
    directory: Path,
    arguments: list[str],
    interactive_inputs: list[str],
    database_error: str | None = None,
) -> Path:
    probe_data_path: Path = directory / "wp47-admin-probe.json"
    probe_data_path.write_text(
        json.dumps(
            {
                "arguments": arguments,
                "interactive_inputs": interactive_inputs,
                "database_error": database_error,
            }
        ),
        encoding="utf-8",
    )
    return probe_data_path


def run_admin_cli_in_real_pty(
    temporary_path: Path,
    prompt_values: list[tuple[str, str]],
    admin_script_path: Path = ADMIN_SCRIPT_PATH,
) -> tuple[int, str]:
    probe_data_path: Path = write_probe_data(temporary_path, [], [])
    child_process_id, terminal_descriptor = pty.fork()
    if child_process_id == 0:
        os.chdir(BACKEND_ROOT)
        os.execv(
            sys.executable,
            [
                sys.executable,
                "-c",
                ADMIN_PTY_PROBE_SOURCE,
                str(admin_script_path),
                str(probe_data_path),
            ],
        )
        os._exit(127)

    terminal_output: bytearray = bytearray()
    child_wait_status: int | None = None
    prompt_search_offset: int = 0

    def wait_for_prompt(prompt: str) -> None:
        nonlocal prompt_search_offset
        expected_prompt: bytes = prompt.encode("utf-8")
        deadline: float = time.monotonic() + 15
        while True:
            prompt_offset: int = terminal_output.find(expected_prompt, prompt_search_offset)
            if prompt_offset >= 0:
                prompt_search_offset = prompt_offset + len(expected_prompt)
                return
            remaining_time: float = deadline - time.monotonic()
            if remaining_time <= 0:
                raise TimeoutError("Timed out waiting for an admin prompt.")
            readable_descriptors, _, _ = select.select(
                [terminal_descriptor],
                [],
                [],
                remaining_time,
            )
            if not readable_descriptors:
                raise TimeoutError("Timed out waiting for an admin prompt.")
            try:
                terminal_chunk: bytes = os.read(terminal_descriptor, 4096)
            except OSError as error:
                raise RuntimeError("The admin process closed its terminal unexpectedly.") from error
            if not terminal_chunk:
                raise RuntimeError("The admin process closed its terminal unexpectedly.")
            terminal_output.extend(terminal_chunk)

    def enter_value(prompt: str, value: str) -> None:
        wait_for_prompt(prompt)
        os.write(terminal_descriptor, f"{value}\n".encode("utf-8"))

    try:
        for prompt, value in prompt_values:
            enter_value(prompt, value)
        deadline = time.monotonic() + 15
        while child_wait_status is None:
            if time.monotonic() >= deadline:
                raise TimeoutError("Timed out waiting for admin seeding to finish.")
            readable_descriptors, _, _ = select.select(
                [terminal_descriptor],
                [],
                [],
                0.1,
            )
            if readable_descriptors:
                try:
                    terminal_chunk = os.read(terminal_descriptor, 4096)
                except OSError:
                    terminal_chunk = b""
                terminal_output.extend(terminal_chunk)
            waited_process_id, wait_status = os.waitpid(child_process_id, os.WNOHANG)
            if waited_process_id == child_process_id:
                child_wait_status = wait_status
    finally:
        if child_wait_status is None:
            os.kill(child_process_id, 9)
            _, child_wait_status = os.waitpid(child_process_id, 0)
        os.close(terminal_descriptor)

    return os.waitstatus_to_exitcode(child_wait_status), terminal_output.decode(
        "utf-8",
        errors="replace",
    )


def run_admin_cli_without_controlling_terminal(
    temporary_path: Path,
    password: str,
    admin_script_path: Path = ADMIN_SCRIPT_PATH,
) -> tuple[int, str]:
    probe_data_path: Path = write_probe_data(temporary_path, [], [])
    terminal_master, terminal_slave = pty.openpty()
    process: subprocess.Popen[bytes] = subprocess.Popen(
        [
            sys.executable,
            "-c",
            ADMIN_PTY_PROBE_SOURCE,
            str(admin_script_path),
            str(probe_data_path),
        ],
        cwd=BACKEND_ROOT,
        stdin=terminal_slave,
        stdout=terminal_slave,
        stderr=terminal_slave,
        close_fds=True,
        start_new_session=True,
    )
    os.close(terminal_slave)
    terminal_output: bytearray = bytearray()
    prompt_values: list[tuple[str, str]] = [
        ("Enter First Name [Admin]:", "Admin"),
        ("Enter Last Name [Super]:", "Super"),
        ("Enter Email:", "terminal-admin@example.invalid"),
        ("Enter Password:", password),
        ("Confirm Password:", password),
    ]
    sent_prompt_count: int = 0

    try:
        deadline: float = time.monotonic() + 15
        while process.poll() is None:
            remaining_time: float = deadline - time.monotonic()
            if remaining_time <= 0:
                raise TimeoutError("Timed out waiting for admin seeding to finish.")
            readable_descriptors, _, _ = select.select(
                [terminal_master],
                [],
                [],
                min(remaining_time, 0.1),
            )
            if readable_descriptors:
                try:
                    terminal_chunk: bytes = os.read(terminal_master, 4096)
                except OSError:
                    terminal_chunk = b""
                terminal_output.extend(terminal_chunk)
            while sent_prompt_count < len(prompt_values):
                prompt, value = prompt_values[sent_prompt_count]
                if prompt.encode("utf-8") not in terminal_output:
                    break
                os.write(terminal_master, f"{value}\n".encode("utf-8"))
                sent_prompt_count += 1
        while True:
            try:
                terminal_chunk = os.read(terminal_master, 4096)
            except OSError:
                break
            if not terminal_chunk:
                break
            terminal_output.extend(terminal_chunk)
    finally:
        os.close(terminal_master)
        if process.poll() is None:
            process.kill()
            process.wait()

    return process.returncode, terminal_output.decode("utf-8", errors="replace")


def test_admin_cli_rejects_legacy_password_option_without_echoing_its_value(
    tmp_path: Path,
) -> None:
    secret_value: str = "LegacyPasswordMustNotAppear-47!"
    process: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-c",
            ADMIN_PROBE_SOURCE,
            str(ADMIN_SCRIPT_PATH),
            str(
                write_probe_data(
                    tmp_path,
                    [
                        "--email",
                        "synthetic-admin@example.invalid",
                        "--password",
                        secret_value,
                        "--non-interactive",
                    ],
                    [],
                )
            ),
        ],
        cwd=BACKEND_ROOT,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )

    assert process.returncode != 0
    assert secret_value not in process.stdout + process.stderr
    assert secret_value not in repr(process.args)


def test_admin_cli_accepts_interactive_password_without_argv_or_output_leak(
    tmp_path: Path,
) -> None:
    secret_value: str = "InteractiveAdminSecret-47!"
    prompt_values: list[tuple[str, str]] = [
        ("Enter First Name [Admin]:", "Admin"),
        ("Enter Last Name [Super]:", "Super"),
        ("Enter Email:", "interactive-admin@example.invalid"),
        ("Enter Password:", secret_value),
        ("Confirm Password:", secret_value),
    ]
    exit_code: int
    terminal_output: str
    exit_code, terminal_output = run_admin_cli_in_real_pty(
        tmp_path,
        prompt_values,
    )

    assert exit_code == 0, terminal_output
    assert secret_value not in terminal_output


def test_admin_cli_uses_non_echoing_password_prompts_on_a_real_terminal(
    tmp_path: Path,
) -> None:
    secret_value: str = "RealTerminalAdminSecret-47!"

    exit_code: int
    terminal_output: str
    exit_code, terminal_output = run_admin_cli_in_real_pty(
        tmp_path,
        [
            ("Enter First Name [Admin]:", "Admin"),
            ("Enter Last Name [Super]:", "Super"),
            ("Enter Email:", "terminal-admin@example.invalid"),
            ("Enter Password:", secret_value),
            ("Confirm Password:", secret_value),
        ],
    )

    assert exit_code == 0, terminal_output
    assert "Enter Password:" in terminal_output
    assert "Confirm Password:" in terminal_output
    assert secret_value not in terminal_output


def test_admin_cli_rejects_getpass_fallback_without_a_controlling_terminal(
    tmp_path: Path,
) -> None:
    secret_value: str = "FallbackAdminSecret-47!"

    exit_code: int
    terminal_output: str
    exit_code, terminal_output = run_admin_cli_without_controlling_terminal(
        tmp_path,
        secret_value,
    )

    assert secret_value not in terminal_output
    assert exit_code == 1
    assert "controlling terminal" in terminal_output.lower()
    assert "getpass" not in terminal_output.lower()


def test_admin_cli_reprompts_for_invalid_and_mismatched_interactive_passwords(
    tmp_path: Path,
) -> None:
    secret_value: str = "ValidatedAdminPassword-47!"
    prompt_values: list[tuple[str, str]] = [
        ("Enter First Name [Admin]:", "Admin"),
        ("Enter Last Name [Super]:", "Super"),
        ("Enter Email:", "interactive-admin@example.invalid"),
        ("Enter Password:", "short"),
        ("Enter Password:", secret_value),
        ("Confirm Password:", "DifferentAdminPassword-47!"),
        ("Enter Password:", secret_value),
        ("Confirm Password:", secret_value),
    ]
    exit_code: int
    terminal_output: str
    exit_code, terminal_output = run_admin_cli_in_real_pty(tmp_path, prompt_values)

    assert exit_code == 0, terminal_output
    assert secret_value not in terminal_output
    assert "DifferentAdminPassword-47!" not in terminal_output
    assert "short" not in terminal_output


@pytest.mark.parametrize("password", ["short", ""])
def test_admin_cli_validates_stdin_password_without_echoing_it(
    tmp_path: Path,
    password: str,
) -> None:
    arguments: list[str] = [
        "--email",
        "synthetic-admin@example.invalid",
        "--non-interactive",
        "--password-stdin",
    ]
    process: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-c",
            ADMIN_PROBE_SOURCE,
            str(ADMIN_SCRIPT_PATH),
            str(write_probe_data(tmp_path, arguments, [])),
        ],
        cwd=BACKEND_ROOT,
        input=f"{password}\n",
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )

    assert process.returncode != 0
    if password:
        assert password not in process.stdout + process.stderr
        assert password not in repr(process.args)


def test_admin_cli_suppresses_database_errors_that_contain_passwords(
    tmp_path: Path,
) -> None:
    secret_value: str = "SyntheticDatabaseSecret-47!"
    arguments: list[str] = [
        "--email",
        "synthetic-admin@example.invalid",
        "--non-interactive",
        "--password",
        "ValidSyntheticAdminPassword-47!",
    ]
    probe_data_path: Path = write_probe_data(
        tmp_path,
        arguments,
        [],
        database_error=f"authentication failed for password {secret_value}",
    )
    process: subprocess.CompletedProcess[str] = subprocess.run(
        [
            sys.executable,
            "-c",
            ADMIN_PROBE_SOURCE,
            str(ADMIN_SCRIPT_PATH),
            str(probe_data_path),
        ],
        cwd=BACKEND_ROOT,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )

    assert process.returncode != 0
    assert secret_value not in process.stdout + process.stderr
    assert secret_value not in repr(process.args)


@pytest.mark.asyncio
async def test_admin_seed_suppresses_database_errors_that_contain_passwords(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import seed_admin

    secret_value: str = "SyntheticDatabaseSecret-47!"

    class FailedSession:
        async def __aenter__(self) -> "FailedSession":
            return self

        async def __aexit__(self, *arguments: Any) -> bool:
            return False

        async def execute(self, statement: Any) -> None:
            raise RuntimeError(f"authentication failed for password {secret_value}")

    def create_failed_session() -> FailedSession:
        return FailedSession()

    monkeypatch.setattr(seed_admin, "AsyncSessionLocal", create_failed_session)
    result: int = await seed_admin.AdminSeedCommand()._seed_user(
        "synthetic-admin@example.invalid",
        "ValidSyntheticAdminPassword-47!",
        "Admin",
        "Super",
    )
    captured_output = capsys.readouterr()

    assert result == 1
    assert "details are suppressed" in captured_output.err
    assert secret_value not in captured_output.out + captured_output.err


@pytest.mark.parametrize("mode", [0o644, 0o664, 0o777])
def test_vm_setup_rejects_existing_password_file_with_unsafe_permissions(
    tmp_path: Path,
    mode: int,
) -> None:
    password_file: Path = tmp_path / "postgres-password"
    password_file.write_text("KnownSyntheticPassword-47!", encoding="utf-8")
    password_file.chmod(mode)
    process: subprocess.CompletedProcess[str] = run_isolated_setup_script(tmp_path, password_file)

    assert process.returncode != 0
    assert "KnownSyntheticPassword-47!" not in process.stdout + process.stderr
    assert password_file.read_text(encoding="utf-8") == "KnownSyntheticPassword-47!"


def test_vm_setup_preserves_existing_password_file_without_logging_or_argv_leaks(
    tmp_path: Path,
) -> None:
    secret_value: str = "KnownSyntheticPassword-47!"
    password_file: Path = tmp_path / "postgres-password"
    password_file.write_text(secret_value, encoding="utf-8")
    password_file.chmod(0o600)

    process: subprocess.CompletedProcess[str] = run_isolated_setup_script(tmp_path, password_file)
    container_arguments_path: Path = tmp_path / "container-arguments"
    captured_arguments: str = container_arguments_path.read_bytes().decode("utf-8", errors="replace")

    assert process.returncode == 0, process.stderr
    assert secret_value not in process.stdout + process.stderr
    assert secret_value not in captured_arguments
    assert secret_value not in repr(process.args)
    assert password_file.read_text(encoding="utf-8") == secret_value
    assert password_file.stat().st_mode & 0o777 == 0o600
    assert "POSTGRES_PASSWORD_FILE" in captured_arguments


def test_vm_setup_keeps_default_password_file_outside_fresh_postgres_data(
    tmp_path: Path,
) -> None:
    process: subprocess.CompletedProcess[str] = run_isolated_setup_script(tmp_path, None)
    isolated_root: Path = tmp_path / "isolated/var"
    database_directory: Path = isolated_root / "postgres_data"
    password_file: Path = isolated_root / "postgres_password"
    arguments: str = (tmp_path / "container-arguments").read_bytes().decode(
        "utf-8",
        errors="replace",
    )

    assert process.returncode == 0, process.stderr
    assert password_file.is_file()
    assert password_file.parent != database_directory
    assert password_file.stat().st_mode & 0o777 == 0o600
    assert "POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password" in arguments
    assert str(password_file) in arguments
    assert not any(database_directory.iterdir())


def test_vm_setup_requires_existing_password_for_initialized_database(
    tmp_path: Path,
) -> None:
    password_file: Path = tmp_path / "postgres-password"

    process: subprocess.CompletedProcess[str] = run_isolated_setup_script(
        tmp_path,
        password_file,
        existing_database=True,
    )

    assert process.returncode != 0
    assert not password_file.exists()
    assert "password" in process.stderr.lower()
    assert "DATABASE_URL=" not in process.stdout


def test_admin_password_validation_and_reset_guards_remain_present() -> None:
    admin_source: str = ADMIN_SCRIPT_PATH.read_text(encoding="utf-8")
    reset_guard_source: str = (BACKEND_ROOT / "scripts/reset_guard.py").read_text(encoding="utf-8")

    assert "at least 8 characters" in admin_source
    assert "getpass" in admin_source
    assert "non-interactive" in admin_source
    assert "ResetTargetGuard" in reset_guard_source
    assert "--reset" in reset_guard_source
