import argparse
import getpass
import os
import re
import shutil
import tempfile
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence
from uuid import uuid4

from sqlalchemy.engine import make_url


STORAGE_MARKER_NAME: str = ".imkon-disposable-reset"
STORAGE_MARKER_VERSION: str = "imkon-disposable-storage:v1"
_RESET_TARGET_AUTHORIZATION: object = object()


class ResetGuardError(ValueError):
    pass


@dataclass(frozen=True, init=False)
class ResetTarget:
    database_identity: str
    storage_root: Path
    dry_run: bool
    _authorization: object

    def __init__(
        self,
        database_identity: str,
        storage_root: Path,
        dry_run: bool,
        authorization: object,
    ) -> None:
        if authorization is not _RESET_TARGET_AUTHORIZATION:
            raise ResetGuardError("Reset targets must come from a validated guard.")
        object.__setattr__(self, "database_identity", database_identity)
        object.__setattr__(self, "storage_root", storage_root)
        object.__setattr__(self, "dry_run", dry_run)
        object.__setattr__(self, "_authorization", authorization)


class ResetTargetGuard:
    def __init__(
        self,
        environment: str,
        database_url: str,
        storage_path: str,
        backend_root: Path,
    ) -> None:
        self.environment: str = environment.strip().lower()
        self.database_url: str = database_url
        self.storage_path: str = storage_path
        self.backend_root: Path = backend_root.resolve(strict=True)

    def parse_and_validate(self, arguments: Sequence[str]) -> ResetTarget:
        argument_parser: argparse.ArgumentParser = argparse.ArgumentParser()
        argument_parser.add_argument("--reset", action="store_true")
        argument_parser.add_argument("--dry-run", action="store_true")
        argument_parser.add_argument("--expected-database", required=True)
        argument_parser.add_argument("--expected-storage", required=True)
        parsed_arguments: argparse.Namespace = argument_parser.parse_args(arguments)

        if not parsed_arguments.reset:
            raise ResetGuardError("Explicit --reset confirmation is required.")
        if self.environment in {"prod", "production"}:
            raise ResetGuardError("Reset tooling is disabled in production.")

        database_identity: str = self._get_database_identity()
        if not self._is_disposable_database(database_identity):
            raise ResetGuardError("Database target is not a local disposable database.")
        if parsed_arguments.expected_database != database_identity:
            raise ResetGuardError("Expected database identity does not match the configured target.")

        try:
            storage_root: Path = self._get_storage_root()
            requested_storage_root: Path = Path(parsed_arguments.expected_storage)
            if not requested_storage_root.is_absolute():
                raise ResetGuardError("Expected storage identity must be an absolute path.")
            if requested_storage_root.resolve(strict=False) != storage_root:
                raise ResetGuardError("Expected storage identity does not match the configured target.")
            self._validate_storage_ownership(storage_root, database_identity)
        except ResetGuardError:
            raise
        except (OSError, RuntimeError, ValueError):
            raise ResetGuardError("Storage target is missing or unsafe.") from None

        return ResetTarget(
            database_identity,
            storage_root,
            parsed_arguments.dry_run,
            _RESET_TARGET_AUTHORIZATION,
        )

    def authorize_target(self, target: ResetTarget) -> ResetTarget:
        if target._authorization is not _RESET_TARGET_AUTHORIZATION:
            raise ResetGuardError("Reset target did not come from a validated guard.")
        requested_arguments: list[str] = [
            "--reset",
            "--expected-database",
            target.database_identity,
            "--expected-storage",
            str(target.storage_root),
        ]
        if target.dry_run:
            requested_arguments.append("--dry-run")
        current_target: ResetTarget = self.parse_and_validate(requested_arguments)
        if current_target != target:
            raise ResetGuardError("Validated reset target no longer matches current settings.")
        return current_target

    def _get_database_identity(self) -> str:
        if "#" in self.database_url:
            raise ResetGuardError("Database URL fragments are not allowed.")
        try:
            database_url = make_url(self.database_url)
        except Exception as error:
            raise ResetGuardError("Configured database target is invalid.") from error

        if database_url.drivername.split("+")[0] != "postgresql":
            raise ResetGuardError("Reset tooling requires a PostgreSQL target.")
        if database_url.query:
            raise ResetGuardError("Database URL query overrides are not allowed.")
        if database_url.host not in {"localhost", "127.0.0.1", "::1"}:
            raise ResetGuardError("Database target must use a loopback host.")
        if not database_url.database:
            raise ResetGuardError("Configured database name is missing.")

        return f"{database_url.host}:{database_url.port or 5432}/{database_url.database}"

    def _is_disposable_database(self, database_identity: str) -> bool:
        database_name: str = database_identity.rsplit("/", maxsplit=1)[-1].lower()
        return re.fullmatch(r"imkon_(?:test|disposable)_db", database_name) is not None

    def _get_storage_root(self) -> Path:
        configured_storage: Path = Path(self.storage_path)
        if not configured_storage.is_absolute():
            configured_storage = self.backend_root / configured_storage
        expected_storage_root: Path = self.backend_root / "storage"
        if configured_storage.is_symlink() or expected_storage_root.is_symlink():
            raise ResetGuardError("Storage target cannot be a symbolic link.")
        storage_root: Path = configured_storage.resolve(strict=True)
        if storage_root != expected_storage_root.resolve(strict=True):
            raise ResetGuardError("Storage target must be the backend storage directory.")
        if storage_root.parent != self.backend_root or storage_root.name != "storage":
            raise ResetGuardError("Storage target is outside the permitted backend root.")
        if not storage_root.is_dir():
            raise ResetGuardError("Storage target must be an existing directory.")
        return storage_root

    def _validate_storage_ownership(self, storage_root: Path, database_identity: str) -> None:
        marker_path: Path = storage_root / STORAGE_MARKER_NAME
        if marker_path.is_symlink() or not marker_path.is_file():
            raise ResetGuardError("Storage target lacks disposable ownership evidence.")
        marker_contents: str = marker_path.read_text(encoding="utf-8").strip()
        expected_contents: str = f"{STORAGE_MARKER_VERSION}\n{database_identity}"
        if marker_contents != expected_contents:
            raise ResetGuardError("Storage ownership evidence does not match the database target.")


class StorageReplacement:
    def __init__(self, target: ResetTarget) -> None:
        self.storage_root: Path = target.storage_root
        self.database_identity: str = target.database_identity
        self.stage_parent: Path | None = None
        self.stage_root: Path | None = None
        self.backup_root: Path | None = None
        self.installed: bool = False

    def prepare(self) -> Path:
        if self.stage_root is not None:
            return self.stage_root

        stage_parent: Path = Path(tempfile.mkdtemp(prefix=".imkon-reset-stage-", dir=self.storage_root.parent))
        stage_root: Path = stage_parent / "storage"
        stage_root.mkdir()
        marker_path: Path = stage_root / STORAGE_MARKER_NAME
        marker_path.write_text(
            f"{STORAGE_MARKER_VERSION}\n{self.database_identity}\n",
            encoding="utf-8",
        )
        self.stage_parent = stage_parent
        self.stage_root = stage_root
        return stage_root

    def install(self) -> None:
        if self.stage_root is None or self.stage_parent is None:
            raise RuntimeError("Storage replacement was not prepared.")
        if self.storage_root.is_symlink() or not self.storage_root.is_dir():
            raise ResetGuardError("Storage target changed before replacement.")
        self._validate_storage_marker(self.storage_root)

        backup_root: Path = self.storage_root.parent / f".imkon-reset-backup-{uuid4().hex}"
        os.replace(self.storage_root, backup_root)
        self.backup_root = backup_root
        try:
            os.replace(self.stage_root, self.storage_root)
        except Exception:
            os.replace(backup_root, self.storage_root)
            self.backup_root = None
            raise
        self.installed = True

    def rollback(self) -> None:
        if self.installed:
            if self.storage_root.is_symlink():
                raise ResetGuardError("Storage target changed during rollback.")
            self._validate_storage_marker(self.storage_root)
            shutil.rmtree(self.storage_root)
            if self.backup_root is not None:
                os.replace(self.backup_root, self.storage_root)
            self.installed = False
        if self.stage_parent is not None and self.stage_parent.exists():
            shutil.rmtree(self.stage_parent)
            self.stage_parent = None
            self.stage_root = None

    def finalize(self) -> None:
        if self.backup_root is not None and self.backup_root.exists():
            self._validate_storage_marker(self.backup_root)
            shutil.rmtree(self.backup_root)
            self.backup_root = None
        if self.stage_parent is not None and self.stage_parent.exists():
            shutil.rmtree(self.stage_parent)
        self.stage_parent = None
        self.stage_root = None

    def _validate_storage_marker(self, storage_root: Path) -> None:
        marker_path: Path = storage_root / STORAGE_MARKER_NAME
        expected_contents: str = f"{STORAGE_MARKER_VERSION}\n{self.database_identity}"
        if marker_path.is_symlink() or not marker_path.is_file():
            raise ResetGuardError("Storage ownership evidence changed during replacement.")
        if marker_path.read_text(encoding="utf-8").strip() != expected_contents:
            raise ResetGuardError("Storage ownership evidence changed during replacement.")


class CredentialProvisioner:
    def __init__(self, prompt: Callable[[str], str] = getpass.getpass) -> None:
        self.prompt: Callable[[str], str] = prompt

    def provision(self, account_labels: Sequence[str]) -> Mapping[str, str]:
        credentials: dict[str, str] = {}
        for account_label in account_labels:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", getpass.GetPassWarning)
                    password: str = self.prompt(f"Temporary password for {account_label}: ")
                    confirmation: str = self.prompt(f"Confirm temporary password for {account_label}: ")
            except Exception:
                raise ResetGuardError("Interactive credential provisioning failed.") from None
            if len(password) < 16 or password != confirmation:
                raise ResetGuardError("Credentials must match and contain at least 16 characters.")
            credentials[account_label] = password
        return credentials
