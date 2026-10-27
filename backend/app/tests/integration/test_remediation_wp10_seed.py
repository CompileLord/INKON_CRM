from __future__ import annotations
from datetime import date
from typing import Callable

import secrets
import io
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.tests.integration.test_remediation_wp10 import make_guard, reset_arguments
from scripts.reset_guard import STORAGE_MARKER_NAME, STORAGE_MARKER_VERSION, ResetTarget, ResetTargetGuard


@pytest.fixture(autouse=True)
def school_day_2026_08_10(freeze_school_today: Callable[[date], None]) -> None:
    freeze_school_today(date(2026, 8, 10))


@pytest.mark.asyncio
async def test_seed_failure_rolls_back_database_and_keeps_original_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    original_storage: Path = tmp_path / "backend" / "storage"
    original_storage.mkdir(parents=True)
    original_file: Path = original_storage / "keep.txt"
    original_file.write_text("original", encoding="utf-8")
    marker_path: Path = original_storage / STORAGE_MARKER_NAME
    marker_path.write_text(
        f"{STORAGE_MARKER_VERSION}\nlocalhost:5432/imkon_test_db\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "STORAGE_PATH", str(original_storage))
    async with AsyncSessionLocal() as session:
        existing_user: User | None = await session.scalar(select(User).where(User.email == "wp10-rollback@example.invalid"))
        if existing_user is None:
            existing_user = User(
                email="wp10-rollback@example.invalid",
                password_hash="preserved-hash",
                first_name="Preserved",
                last_name="User",
                role="student",
                must_set_password=True,
            )
            session.add(existing_user)
            await session.commit()

    from scripts import seed_demo_data
    from scripts.reset_guard import StorageReplacement

    async def populate_without_external_assets(*args: object, **kwargs: object) -> None:
        return None

    original_install = StorageReplacement.install

    def install_then_fail(storage_replacement: StorageReplacement) -> None:
        original_install(storage_replacement)
        raise RuntimeError("injected seed failure")

    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", lambda: {})
    monkeypatch.setattr(seed_demo_data, "populate_demo_data", populate_without_external_assets)
    monkeypatch.setattr(StorageReplacement, "install", install_then_fail)
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(tmp_path / "backend"))
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)

    with pytest.raises(RuntimeError, match="injected seed failure"):
        await seed_demo_data.seed_demo_data(target, "test administrator credential", "test demo credential")

    assert original_file.read_text(encoding="utf-8") == "original"
    async with AsyncSessionLocal() as session:
        preserved_user: User | None = await session.scalar(select(User).where(User.email == "wp10-rollback@example.invalid"))
    assert preserved_user is not None


@pytest.mark.asyncio
async def test_demo_seed_populates_ready_login_users_and_replaces_only_disposable_storage(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from scripts import seed_demo_data
    storage_root: Path = tmp_path / "backend" / "storage"
    storage_root.mkdir(parents=True)
    old_file: Path = storage_root / "old-upload.txt"
    old_file.write_text("old disposable content", encoding="utf-8")
    marker_path: Path = storage_root / STORAGE_MARKER_NAME
    marker_path.write_text(
        f"{STORAGE_MARKER_VERSION}\nlocalhost:5432/imkon_test_db\n",
        encoding="utf-8",
    )
    image_bytes_buffer: io.BytesIO = io.BytesIO()
    Image.new("RGB", (4, 4), color=(10, 20, 30)).save(image_bytes_buffer, format="JPEG")
    image_bytes: bytes = image_bytes_buffer.getvalue()
    staged_assets: dict[str, bytes] = {
        **{f"mentor:{email}": image_bytes for email in seed_demo_data.MENTOR_PHOTO_URLS},
        **{f"course:{course_id}": image_bytes for course_id in seed_demo_data.COURSE_PHOTO_URLS},
    }
    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", lambda: staged_assets)
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(tmp_path / "backend"))
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    administrator_password = "integration administrator credential"
    demo_password = "integration demo credential"

    await seed_demo_data.seed_demo_data(target, administrator_password, demo_password)

    async with AsyncSessionLocal() as session:
        seeded_users: list[User] = list((await session.scalars(select(User))).all())
        administrator: User | None = await session.scalar(select(User).where(User.email == "superadmin@mail.com"))
        accountant: User | None = await session.scalar(select(User).where(User.email == "accountant@test.com"))

    assert len(seeded_users) == 37
    assert not any(user.must_set_password for user in seeded_users)
    assert administrator is not None
    assert accountant is not None
    assert verify_password(administrator_password, administrator.password_hash)
    assert verify_password(demo_password, accountant.password_hash)
    assert administrator_password != demo_password
    assert not old_file.exists()
    assert (storage_root / "course" / "1" / "course_image.jpg").is_file()
    assert (storage_root / "avatar" / "3" / "avatar_thumb.jpg").is_file()


@pytest.mark.asyncio
async def test_asset_staging_failure_keeps_database_and_storage_untouched(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import seed_demo_data
    original_storage: Path = tmp_path / "backend" / "storage"
    original_storage.mkdir(parents=True)
    original_file: Path = original_storage / "keep.txt"
    original_file.write_text("original", encoding="utf-8")
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(tmp_path / "backend"))
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    database_accesses: list[bool] = []

    class FakeEngine:
        def begin(self) -> object:
            database_accesses.append(True)
            raise AssertionError("database reset began before assets were staged")

    def fail_asset_staging() -> dict[str, bytes]:
        raise RuntimeError("injected download failure")

    monkeypatch.setattr(seed_demo_data, "engine", FakeEngine())
    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", fail_asset_staging)

    with pytest.raises(RuntimeError, match="injected download failure"):
        await seed_demo_data.seed_demo_data(target, "test administrator credential", "test demo credential")

    assert database_accesses == []
    assert original_file.read_text(encoding="utf-8") == "original"


@pytest.mark.asyncio
async def test_clean_database_uses_supplied_one_time_credential_requiring_change(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import clean_db
    from scripts.reset_guard import ResetTargetGuard

    captured_users: list[User] = []

    class FakeConnection:
        async def execute(self, statement: object) -> None:
            return None

    class FakeTransaction:
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(self, exception_type: object, exception: object, traceback: object) -> bool:
            return False

    class FakeEngine:
        def begin(self) -> FakeTransaction:
            return FakeTransaction()

    class FakeSession:
        async def __aenter__(self) -> FakeSession:
            return self

        async def __aexit__(self, exception_type: object, exception: object, traceback: object) -> bool:
            return False

        def add(self, user: User) -> None:
            captured_users.append(user)

        async def flush(self) -> None:
            return None

    monkeypatch.setattr(clean_db, "engine", FakeEngine())
    monkeypatch.setattr(clean_db, "AsyncSession", lambda **kwargs: FakeSession())
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(guard.backend_root))
    monkeypatch.setattr(clean_db, "create_reset_guard", lambda: guard)
    one_time_password: str = "test administrator credential"
    await clean_db.clean_database(target, one_time_password)

    assert len(captured_users) == 1
    assert verify_password(one_time_password, captured_users[0].password_hash)
    assert captured_users[0].must_set_password is True


@pytest.mark.asyncio
async def test_clean_database_failure_rolls_back_truncation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import clean_db

    email: str = f"wp10-clean-rollback-{secrets.token_hex(6)}@example.invalid"
    async with AsyncSessionLocal() as session:
        session.add(User(
            email=email,
            password_hash="preserved-hash",
            first_name="Preserved",
            last_name="User",
            role="student",
            must_set_password=True,
        ))
        await session.commit()

    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(tmp_path / "backend"))
    monkeypatch.setattr(clean_db, "create_reset_guard", lambda: guard)
    original_engine = clean_db.engine

    class FaultingConnection:
        def __init__(self, connection: object) -> None:
            self.connection = connection

        async def execute(self, statement: object) -> None:
            await self.connection.execute(statement)
            if "TRUNCATE TABLE users" in str(statement):
                raise RuntimeError("injected reset failure")

    class FaultingTransaction:
        def __init__(self) -> None:
            self.transaction = original_engine.begin()

        async def __aenter__(self) -> FaultingConnection:
            return FaultingConnection(await self.transaction.__aenter__())

        async def __aexit__(self, exception_type: object, exception: object, traceback: object) -> bool:
            return await self.transaction.__aexit__(exception_type, exception, traceback)

    class FaultingEngine:
        def begin(self) -> FaultingTransaction:
            return FaultingTransaction()

    monkeypatch.setattr(clean_db, "engine", FaultingEngine())
    with pytest.raises(RuntimeError, match="injected reset failure"):
        await clean_db.clean_database(target, secrets.token_urlsafe(24))

    async with AsyncSessionLocal() as session:
        preserved_user: User | None = await session.scalar(select(User).where(User.email == email))
    assert preserved_user is not None


@pytest.mark.asyncio
async def test_demo_assets_are_staged_before_database_or_storage_replacement(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from scripts import seed_demo_data
    from scripts.reset_guard import ResetTargetGuard

    observed_events: list[str] = []
    captured_population: dict[str, object] = {}

    class FakeConnection:
        async def execute(self, statement: object) -> None:
            observed_events.append("truncate")

    class FakeTransaction:
        async def __aenter__(self) -> FakeConnection:
            observed_events.append("begin")
            return FakeConnection()

        async def __aexit__(self, exception_type: object, exception: object, traceback: object) -> bool:
            observed_events.append("commit" if exception_type is None else "rollback")
            return False

    class FakeEngine:
        def begin(self) -> FakeTransaction:
            return FakeTransaction()

    class FakeStorageReplacement:
        def __init__(self, target: ResetTarget) -> None:
            self.target: ResetTarget = target

        def prepare(self) -> Path:
            observed_events.append("prepare_storage")
            return Path("/tmp/disposable/staged-storage")

        def install(self) -> None:
            observed_events.append("install_storage")

        def rollback(self) -> None:
            observed_events.append("rollback_storage")

        def finalize(self) -> None:
            observed_events.append("finalize_storage")

    async def populate(**kwargs: object) -> None:
        observed_events.append("populate")
        captured_population.update(kwargs)

    monkeypatch.setattr(seed_demo_data, "engine", FakeEngine())
    monkeypatch.setattr(seed_demo_data, "StorageReplacement", FakeStorageReplacement)
    monkeypatch.setattr(seed_demo_data, "stage_downloadable_assets", lambda: observed_events.append("download") or {"course:1": b"staged"})
    monkeypatch.setattr(seed_demo_data, "populate_demo_data", populate)
    guard: ResetTargetGuard = make_guard(tmp_path / "backend")
    target = guard.parse_and_validate(reset_arguments(guard.backend_root))
    monkeypatch.setattr(seed_demo_data, "create_reset_guard", lambda: guard)
    administrator_password = "test administrator credential"
    demo_password = "test demo credential"

    await seed_demo_data.seed_demo_data(target, administrator_password, demo_password)

    assert observed_events[0] == "download"
    assert observed_events.index("truncate") < observed_events.index("populate")
    assert observed_events.index("populate") < observed_events.index("install_storage") < observed_events.index("commit")
    assert observed_events.index("commit") < observed_events.index("finalize_storage")
    assert captured_population["administrator_password"] == administrator_password
    assert captured_population["demo_password"] == demo_password
    assert administrator_password != demo_password


@pytest.fixture(autouse=True)
def enable_email_less_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ALLOW_EMAILLESS_USERS", True)
