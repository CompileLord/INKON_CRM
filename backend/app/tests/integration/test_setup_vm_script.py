from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
SETUP_SCRIPT_PATH: Path = BACKEND_ROOT / "scripts/setup_free_tier_vm.sh"


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
    environment.pop("POSTGRES_PASSWORD", None)
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


