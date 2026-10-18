import asyncio
import io
import os
import subprocess
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio
from fastapi import UploadFile
from httpx import AsyncClient, Response
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.db.storage_intent_session import StorageIntentSessions
from app.models.course import Course
from app.models.document import Document
from app.models.journal import Journal
from app.models.storage_intent import StorageIntent
from app.models.user import User
from app.repositories.sqlalchemy.storage_intent_repository import SQLAlchemyStorageIntentRepository
from app.services.course_service import CourseService
from app.services.document_service import DocumentService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.services.storage_service import LocalStorageService
from app.services.user_service import UserService
from app.tests.conftest import TEST_DATABASE_URL, TestingSessionLocal
from app.tests.integration.test_remediation_wp11 import ConfigurationProbe, MigrationDatabaseProbe
from app.workers.storage_cleanup import StorageCleanupWorker


class ImageUpload:
    @classmethod
    def create(cls, color: str = 'red') -> UploadFile:
        content: io.BytesIO = io.BytesIO()
        image: Image.Image = Image.new('RGB', (30, 40), color)
        image.save(content, format='PNG')
        content.seek(0)
        return UploadFile(filename='same.png', file=content)


@pytest.mark.asyncio
async def test_identical_names_never_overwrite(tmp_path: Path) -> None:
    storage: LocalStorageService = LocalStorageService(str(tmp_path))
    first: str = await storage.save(b'first', 'avatar', 1, 'same.png')
    second: str = await storage.save(b'second', 'avatar', 1, 'same.png')
    assert first != second
    assert await storage.read(first) == b'first'
    assert await storage.read(second) == b'second'
    await storage.delete(first)
    assert await storage.read(second) == b'second'


@pytest.mark.asyncio
async def test_replacement_rollback_keeps_previous_bytes(db_session: AsyncSession, test_student: User) -> None:
    storage: LocalStorageService = LocalStorageService()
    old: str = await storage.save(b'old-photo', 'avatar', test_student.id, 'legacy.png')
    persisted_user: User | None = await db_session.get(User, test_student.id)
    assert persisted_user is not None
    persisted_user.photo_path = old
    await db_session.commit()
    service: UserService = UserService(db_session)
    await service.upload_avatar(test_student.id, ImageUpload.create())
    await db_session.rollback()
    assert await storage.read(old) == b'old-photo'


class LifecycleScenario:
    def __init__(self, root: Path) -> None:
        self.storage: LocalStorageService = LocalStorageService(str(root))
        self.sessions: StorageIntentSessions = StorageIntentSessions(TEST_DATABASE_URL)
        self.worker: StorageCleanupWorker = StorageCleanupWorker(self.sessions, self.storage)
        self.future: datetime = datetime.now(timezone.utc) + timedelta(hours=1)

    def service(self, session: AsyncSession) -> StorageLifecycleService:
        return StorageLifecycleService(session, self.storage, self.sessions)

    async def intents(self) -> list[StorageIntent]:
        session: AsyncSession
        async with self.sessions.factory() as session:
            return list((await session.execute(select(StorageIntent))).scalars())


@pytest_asyncio.fixture
async def lifecycle(tmp_path: Path) -> AsyncIterator[LifecycleScenario]:
    scenario: LifecycleScenario = LifecycleScenario(tmp_path)
    try:
        yield scenario
    finally:
        await scenario.sessions.close()


@pytest.mark.asyncio
async def test_staging_commit_adoption_and_rollback_recovery(lifecycle: LifecycleScenario, test_student: User) -> None:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = lifecycle.service(session)
        staged_abandoned: tuple[str, str] = await service.stage(b'abandoned', 'avatar', test_student.id, 'same.png')
        abandoned: str = staged_abandoned[0]
        abandoned_id: str = staged_abandoned[1]
        assert len(await lifecycle.intents()) == 1
        assert await lifecycle.worker.run_once(lifecycle.future) == 0
        await session.rollback()
    assert await lifecycle.storage.read(abandoned) == b'abandoned'
    await lifecycle.worker.run_once(lifecycle.future)
    with pytest.raises(FileNotFoundError):
        await lifecycle.storage.read(abandoned)
    assert await lifecycle.intents() == []
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = lifecycle.service(session)
        staged_adopted: tuple[str, str] = await service.stage(b'adopted', 'avatar', test_student.id, 'same.png')
        adopted: str = staged_adopted[0]
        adopted_id: str = staged_adopted[1]
        user: User | None = await session.get(User, test_student.id)
        assert user is not None
        user.photo_path = adopted
        await service.adopt(adopted_id)
        await session.commit()
    await lifecycle.worker.run_once(lifecycle.future)
    assert await lifecycle.storage.read(adopted) == b'adopted'
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_failed_thumbnail_write_leaves_old_asset_and_cleans_both_stages(
    lifecycle: LifecycleScenario, test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    session: AsyncSession
    old: str = await lifecycle.storage.save(b'old', 'avatar', test_student.id, 'old.png')
    original_write: Callable[[str, bytes], None] = lifecycle.storage._write
    writes: int = 0

    def partial_write(key: str, content: bytes) -> None:
        nonlocal writes
        writes += 1
        original_write(key, content)
        if writes == 2:
            raise OSError('synthetic failed thumbnail')

    monkeypatch.setattr(lifecycle.storage, '_write', partial_write)
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = lifecycle.service(session)
        await service.stage(b'photo', 'avatar', test_student.id, 'photo.png')
        with pytest.raises(OSError):
            await service.stage(b'thumbnail', 'avatar', test_student.id, 'thumb.png')
        await session.rollback()
    stages: list[StorageIntent] = await lifecycle.intents()
    assert len(stages) == 2
    await StorageCleanupWorker(lifecycle.sessions, lifecycle.storage).run_once(lifecycle.future)
    assert await lifecycle.intents() == []
    assert await lifecycle.storage.read(old) == b'old'
    stage: StorageIntent
    for stage in stages:
        with pytest.raises(FileNotFoundError):
            await lifecycle.storage.read(stage.object_key)


@pytest.mark.asyncio
async def test_claim_before_adoption_prevents_any_bytes(lifecycle: LifecycleScenario, monkeypatch: pytest.MonkeyPatch) -> None:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = lifecycle.service(session)
        original_lock: Callable[[str], Awaitable[StorageIntent | None]] = service.repository.lock_pending

        async def claim_first(intent_id: str) -> StorageIntent | None:
            await lifecycle.worker.run_once(lifecycle.future)
            return await original_lock(intent_id)

        monkeypatch.setattr(service.repository, 'lock_pending', claim_first)
        with pytest.raises(RuntimeError, match='reservation'):
            await service.stage(b'never written', 'avatar', 31, 'file.png')
        await session.rollback()
    assert list(Path(lifecycle.storage.storage_path).rglob('*')) == []
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_worker_restart_after_delete_before_settlement_is_idempotent(
    lifecycle: LifecycleScenario, monkeypatch: pytest.MonkeyPatch,
) -> None:
    session: AsyncSession
    path: str = await lifecycle.storage.save(b'delete', 'avatar', 1, 'file.png')
    async with TestingSessionLocal() as session:
        await lifecycle.service(session).delete_after_commit(path)
        await session.commit()
    original_settle: Callable[[SQLAlchemyStorageIntentRepository, str, str, str | None, datetime], Awaitable[bool]] = SQLAlchemyStorageIntentRepository.settle

    async def crash(self: SQLAlchemyStorageIntentRepository, intent_id: str, token: str, error: str | None, retry_at: datetime) -> bool:
        raise RuntimeError('worker interrupted after deletion')

    monkeypatch.setattr(SQLAlchemyStorageIntentRepository, 'settle', crash)
    with pytest.raises(RuntimeError):
        await lifecycle.worker.run_once()
    with pytest.raises(FileNotFoundError):
        await lifecycle.storage.read(path)
    assert (await lifecycle.intents())[0].state == 'claimed'
    monkeypatch.setattr(SQLAlchemyStorageIntentRepository, 'settle', original_settle)
    await StorageCleanupWorker(lifecycle.sessions, lifecycle.storage).run_once(lifecycle.future)
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_retryable_failure_never_discards_intent(lifecycle: LifecycleScenario, monkeypatch: pytest.MonkeyPatch) -> None:
    session: AsyncSession
    path: str = await lifecycle.storage.save(b'retry', 'course', 1, 'image.png')
    async with TestingSessionLocal() as session:
        await lifecycle.service(session).delete_after_commit(path)
        await session.commit()
    original_delete: Callable[[str], Awaitable[bool]] = lifecycle.storage.delete

    async def unavailable(filepath: str) -> bool:
        raise PermissionError('synthetic transport error')

    monkeypatch.setattr(lifecycle.storage, 'delete', unavailable)
    index: int
    for index in range(7):
        await lifecycle.worker.run_once(lifecycle.future + timedelta(minutes=index))
    intents: list[StorageIntent] = await lifecycle.intents()
    assert len(intents) == 1 and intents[0].attempts == 7
    assert intents[0].last_error == 'PermissionError'
    monkeypatch.setattr(lifecycle.storage, 'delete', original_delete)
    await lifecycle.worker.run_once(lifecycle.future + timedelta(minutes=8))
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_reservation_outage_writes_nothing(lifecycle: LifecycleScenario, monkeypatch: pytest.MonkeyPatch) -> None:
    session: AsyncSession
    def unavailable_factory() -> AsyncSession:
        raise ConnectionError('synthetic unavailable database')

    monkeypatch.setattr(lifecycle.sessions, 'factory', unavailable_factory)
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = lifecycle.service(session)
        with pytest.raises(ConnectionError):
            await service.stage(b'never written', 'avatar', 1, 'file.png')
    assert list(Path(lifecycle.storage.storage_path).rglob('*')) == []


@pytest.mark.asyncio
async def test_solo_request_pool_and_bounded_independent_reservation(lifecycle: LifecycleScenario) -> None:
    session: AsyncSession
    first: AsyncSession
    engine: AsyncEngine = create_async_engine(TEST_DATABASE_URL, pool_size=1, max_overflow=0, pool_timeout=1)
    factory: async_sessionmaker[AsyncSession] = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            await session.execute(text('SELECT 1'))
            await asyncio.wait_for(lifecycle.service(session).stage(b'bytes', 'avatar', 1, 'same.png'), 3)
            assert engine.pool.checkedout() == 1
            assert lifecycle.sessions.engine.pool.size() == 1
            assert lifecycle.sessions.engine.pool.checkedout() == 0
            await session.rollback()
        async with lifecycle.sessions.factory() as first:
            await first.execute(text('SELECT 1'))
            async def second_checkout() -> None:
                second: AsyncSession
                async with lifecycle.sessions.factory() as second:
                    await second.execute(text('SELECT 1'))
            contender: asyncio.Task[None] = asyncio.create_task(second_checkout())
            await asyncio.sleep(0.05)
            assert not contender.done()
            assert lifecycle.sessions.engine.pool.checkedout() == 1
            await first.rollback()
            await contender
        await lifecycle.sessions.close()
        assert lifecycle.sessions.engine.pool.checkedout() == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize('key', ['/etc/passwd', '../outside', 'avatar/0/x.png', 'avatar/01/x.png', 'avatar/1/../x.png', 'avatar/1/' + 'x' * 256, 'avatar/1/x/y.png', 'other/1/x.png'])
async def test_invalid_cleanup_paths_fail_closed(lifecycle: LifecycleScenario, key: str) -> None:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        with pytest.raises(ValueError):
            await lifecycle.service(session).delete_after_commit(key)
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_symlinks_and_collisions_never_overwrite_or_delete_external_bytes(lifecycle: LifecycleScenario, tmp_path: Path) -> None:
    outside: Path = tmp_path / 'external'
    outside.mkdir()
    sentinel: Path = outside / 'sentinel.png'
    sentinel.write_bytes(b'preserve')
    root: Path = tmp_path / 'root'
    root.mkdir()
    (root / 'avatar').symlink_to(outside, target_is_directory=True)
    storage: LocalStorageService = LocalStorageService(str(root))
    with pytest.raises((ValueError, OSError)):
        await storage.save(b'bad', 'avatar', 1, 'file.png')
    assert sentinel.read_bytes() == b'preserve'
    key: str = lifecycle.storage.new_key('avatar', 1, 'file.png')
    await lifecycle.storage.write_reserved(b'first', key)
    with pytest.raises(FileExistsError):
        await lifecycle.storage.write_reserved(b'second', key)
    assert await lifecycle.storage.read(key) == b'first'


@pytest.mark.asyncio
async def test_concurrent_avatar_replacements_do_not_leak_intermediate_objects(test_student: User) -> None:
    session: AsyncSession
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    connection_ids: set[int] = set()
    async def replace(color: str) -> tuple[str, str]:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            connection_ids.add(int((await session.execute(text('SELECT pg_backend_pid()'))).scalar_one()))
            await barrier.wait()
            user: User = await UserService(session).upload_avatar(test_student.id, ImageUpload.create(color))
            assert user.photo_path is not None and user.thumbnail_path is not None
            paths: tuple[str, str] = (user.photo_path, user.thumbnail_path)
            await session.commit()
            return paths
    results: list[tuple[str, str]] = await asyncio.gather(replace('red'), replace('blue'))
    assert len(connection_ids) == 2
    assert results[0][0] != results[1][0]
    async with TestingSessionLocal() as session:
        user: User | None = await session.get(User, test_student.id)
        assert user is not None
        active: set[str | None] = {user.photo_path, user.thumbnail_path}
    await StorageCleanupWorker().run_once()
    storage: LocalStorageService = LocalStorageService()
    paths: tuple[str, str]
    path: str
    for paths in results:
        for path in paths:
            if path in active:
                assert await storage.read(path)
            else:
                with pytest.raises(FileNotFoundError):
                    await storage.read(path)


@pytest.mark.asyncio
async def test_shared_legacy_paths_and_soft_deleted_photo_references_are_protected(
    lifecycle: LifecycleScenario, test_student: User, test_admin: User, test_mentor: User,
) -> None:
    session: AsyncSession
    path: str = await lifecycle.storage.save(b'legacy', 'student', test_student.id, 'shared.pdf')
    async with TestingSessionLocal() as session:
        first: Document = Document(owner_type='student', owner_id=test_student.id, file_path=path,
            file_name='original.pdf', file_type='application/pdf', file_size=6, uploaded_by_id=test_admin.id)
        second: Document = Document(owner_type='student', owner_id=test_student.id, file_path=path,
            file_name='original.pdf', file_type='application/pdf', file_size=6, uploaded_by_id=test_admin.id)
        session.add_all([first, second])
        await session.commit()
        first.is_deleted = True
        await lifecycle.service(session).delete_after_commit(path)
        await session.commit()
        await lifecycle.worker.run_once(lifecycle.future)
        assert await lifecycle.storage.read(path) == b'legacy'
        second.is_deleted = True
        user: User | None = await session.get(User, test_student.id)
        assert user is not None
        user.thumbnail_path = path
        user.is_deleted = True
        await session.commit()
        await lifecycle.worker.run_once(lifecycle.future + timedelta(minutes=1))
        assert await lifecycle.storage.read(path) == b'legacy'
        user.thumbnail_path = None
        course: Course = Course(title='Legacy', description='preserve reference', start_date=date(2025, 1, 1),
            end_date=date(2026, 1, 1), exam_type='monthly', price=Decimal('10.00'), mentor_id=test_mentor.id,
            photo_path=path, is_deleted=True)
        session.add(course)
        await session.commit()
        await lifecycle.worker.run_once(lifecycle.future + timedelta(minutes=2))
        assert await lifecycle.storage.read(path) == b'legacy'
        course.photo_path = None
        await session.commit()
        await lifecycle.worker.run_once(lifecycle.future + timedelta(minutes=3))
    with pytest.raises(FileNotFoundError):
        await lifecycle.storage.read(path)
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_same_name_across_journals_preserves_metadata_and_independent_deletion(
    client: AsyncClient, test_admin: User, test_student: User, test_mentor: User,
) -> None:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        course: Course = Course(title='Documents', description='journal attachments', start_date=date(2025, 1, 1),
            end_date=date(2026, 1, 1), exam_type='monthly', price=Decimal('10.00'), mentor_id=test_mentor.id)
        session.add(course)
        await session.flush()
        journals: list[Journal] = [Journal(course_id=course.id, period_label=str(index), period_start=date(2025, index, 1),
            period_end=date(2025, index, 28), period_type='monthly') for index in (1, 2)]
        session.add_all(journals)
        await session.commit()
    headers: dict[str, str] = {'Authorization': f'Bearer {create_access_token(test_admin.id, test_admin.role)}'}
    documents: list[dict[str, Any]] = []
    index: int
    journal: Journal
    for index, journal in enumerate(journals):
        content: bytes = f'%PDF-1.5\nattachment {index}'.encode()
        response: Response = await client.post('/api/v1/documents/', data={'owner_type': 'student', 'owner_id': test_student.id, 'journal_id': journal.id},
            files={'file': ('original.pdf', content, 'application/pdf')}, headers=headers)
        assert response.status_code == 201
        document: dict[str, Any] = response.json()
        assert document['file_name'] == 'original.pdf'
        assert document['file_type'] == 'application/pdf'
        assert document['file_size'] == len(content)
        documents.append(document)
    assert documents[0]['file_path'] != documents[1]['file_path']
    async with TestingSessionLocal() as session:
        await DocumentService(session).delete_document(documents[0]['id'])
        await session.rollback()
    storage: LocalStorageService = LocalStorageService()
    assert await storage.read(documents[0]['file_path'])
    async with TestingSessionLocal() as session:
        await DocumentService(session).delete_document(documents[0]['id'])
        await session.commit()
    assert await storage.read(documents[0]['file_path'])
    await StorageCleanupWorker().run_once()
    with pytest.raises(FileNotFoundError):
        await storage.read(documents[0]['file_path'])
    assert await storage.read(documents[1]['file_path']) == b'%PDF-1.5\nattachment 1'


@pytest.mark.asyncio
async def test_migration_upgrade_preserves_legacy_metadata_and_downgrade_recovery(tmp_path: Path) -> None:
    database: str = f'wp25_{uuid4().hex}'
    username: str = f'wp25_{uuid4().hex}'
    password: str = 'wp25-synthetic-password'
    database_probe: MigrationDatabaseProbe = MigrationDatabaseProbe(TEST_DATABASE_URL)
    configuration: ConfigurationProbe = ConfigurationProbe(tmp_path)
    await database_probe.create(database, username, password)
    url: str = database_probe.migration_url(database, username, password).render_as_string(hide_password=False)
    environment: dict[str, str] = {'DATABASE_URL': url}
    try:
        upgraded: subprocess.CompletedProcess[str] = configuration.run_alembic(environment, False, 'd4e5f6a7b8c9')
        assert upgraded.returncode == 0, upgraded.stderr
        connection: asyncpg.Connection = await asyncpg.connect(url.replace('+asyncpg', '', 1))
        try:
            await connection.execute("INSERT INTO users(email,first_name,last_name,role,photo_path) VALUES ('legacy@example.invalid','Legacy','Owner','student','/storage/avatar/1/avatar.png')")
        finally:
            await connection.close()
        upgraded: subprocess.CompletedProcess[str] = configuration.run_alembic(environment, False)
        assert upgraded.returncode == 0, upgraded.stderr
        connection: asyncpg.Connection = await asyncpg.connect(url.replace('+asyncpg', '', 1))
        try:
            assert await connection.fetchval("SELECT photo_path FROM users WHERE email='legacy@example.invalid'") == '/storage/avatar/1/avatar.png'
            assert await connection.fetchval("SELECT to_regclass('storage_intents') IS NOT NULL")
        finally:
            await connection.close()
        backend_root: Path = Path(__file__).resolve().parents[3]
        connection: asyncpg.Connection = await asyncpg.connect(url.replace('+asyncpg', '', 1))
        try:
            await connection.execute("INSERT INTO storage_intents(id,object_key,purpose,state,next_attempt_at,attempts) VALUES ('migration-orphan','avatar/1/orphan.png','stage','pending',now(),0)")
        finally:
            await connection.close()
        arguments: list[str] = ['python', '-m', 'alembic', '-c', str(backend_root / 'alembic.ini'), 'downgrade', 'd4e5f6a7b8c9']
        blocked: subprocess.CompletedProcess[str] = subprocess.run(arguments,
            cwd=tmp_path, env=configuration.environment(environment), capture_output=True, text=True, check=False)
        assert blocked.returncode != 0
        assert 'must be drained' in blocked.stderr
        migration_sessions: StorageIntentSessions = StorageIntentSessions(url)
        try:
            await StorageCleanupWorker(migration_sessions, LocalStorageService(str(tmp_path / 'migration-storage'))).run_once()
        finally:
            await migration_sessions.close()
        downgraded: subprocess.CompletedProcess[str] = subprocess.run(arguments,
            cwd=tmp_path, env=configuration.environment(environment), capture_output=True, text=True, check=False)
        assert downgraded.returncode == 0, downgraded.stderr
        upgraded: subprocess.CompletedProcess[str] = configuration.run_alembic(environment, False)
        assert upgraded.returncode == 0, upgraded.stderr
        connection: asyncpg.Connection = await asyncpg.connect(url.replace('+asyncpg', '', 1))
        try:
            assert await connection.fetchval("SELECT photo_path FROM users WHERE email='legacy@example.invalid'") == '/storage/avatar/1/avatar.png'
        finally:
            await connection.close()
    finally:
        await database_probe.drop(database, username)


@pytest.mark.asyncio
async def test_worker_and_adoption_barrier_never_delete_inflight_object(lifecycle: LifecycleScenario) -> None:
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    inspected: asyncio.Event = asyncio.Event()
    async def upload() -> str:
        session: AsyncSession
        async with TestingSessionLocal() as session:
            service: StorageLifecycleService = lifecycle.service(session)
            staged_path: tuple[str, str] = await service.stage(b'active', 'avatar', 1, 'file.png')
            path: str = staged_path[0]
            intent_id: str = staged_path[1]
            await barrier.wait()
            await inspected.wait()
            await service.adopt(intent_id)
            await session.commit()
            return path
    async def cleanup() -> None:
        await barrier.wait()
        try:
            assert await lifecycle.worker.run_once(lifecycle.future) == 0
        finally:
            inspected.set()
    results: list[str | None] = await asyncio.gather(upload(), cleanup())
    assert results[0] is not None
    await lifecycle.worker.run_once(lifecycle.future)
    assert await lifecycle.storage.read(results[0]) == b'active'
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_process_death_keeps_durable_stage_recoverable(lifecycle: LifecycleScenario, tmp_path: Path) -> None:
    script: str = '''
import asyncio
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.tests.conftest import TestingSessionLocal
from app.db.storage_intent_session import StorageIntentSessions
from app.services.storage_service import LocalStorageService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.core.config import settings
async def run() -> None:
    reservations: StorageIntentSessions = StorageIntentSessions(settings.DATABASE_URL)
    session: AsyncSession
    async with TestingSessionLocal() as session:
        service: StorageLifecycleService = StorageLifecycleService(session, LocalStorageService(os.environ['WP25_ROOT']), reservations)
        path: str
        intent: str
        path, intent = await service.stage(b'crashed', 'avatar', 1, 'crash.png')
        Path(os.environ['WP25_RESULT']).write_text(path)
        os._exit(23)
asyncio.run(run())
'''
    result_path: Path = tmp_path / 'crashed-path.txt'
    environment: dict[str, str] = {**os.environ, 'WP25_ROOT': lifecycle.storage.storage_path, 'WP25_RESULT': str(result_path)}
    result: subprocess.CompletedProcess[str] = await asyncio.to_thread(subprocess.run, ['python', '-c', script], env=environment, capture_output=True, text=True, check=False)
    assert result.returncode == 23, result.stderr
    path: str = result_path.read_text()
    assert await lifecycle.storage.read(path) == b'crashed'
    assert len(await lifecycle.intents()) == 1
    await StorageCleanupWorker(lifecycle.sessions, lifecycle.storage).run_once(lifecycle.future)
    with pytest.raises(FileNotFoundError):
        await lifecycle.storage.read(path)
    assert await lifecycle.intents() == []


@pytest.mark.asyncio
async def test_worker_shutdown_disposes_its_bounded_engine(lifecycle: LifecycleScenario) -> None:
    session: AsyncSession
    async with lifecycle.sessions.factory() as session:
        backend_pid: int = int((await session.execute(text('SELECT pg_backend_pid()'))).scalar_one())
    await lifecycle.worker.start()
    task: asyncio.Task[None] | None = lifecycle.worker.task
    assert task is not None
    await asyncio.sleep(0.02)
    await lifecycle.worker.stop()
    assert task.done()
    assert lifecycle.worker.task is None
    assert lifecycle.sessions.engine.pool.checkedout() == 0
    async with TestingSessionLocal() as session:
        connected: bool = True
        attempt: int
        for attempt in range(50):
            connected: bool = bool((await session.execute(text('SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = :pid)'), {'pid': backend_pid})).scalar_one())
            if not connected:
                break
            await asyncio.sleep(0.02)
        assert not connected


@pytest_asyncio.fixture
async def image_course(test_mentor: User) -> Course:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        course: Course = Course(title='Image producer', description='Durable replacements',
            start_date=date(2025, 1, 1), end_date=date(2026, 1, 1), exam_type='monthly',
            price=Decimal('10.00'), mentor_id=test_mentor.id)
        session.add(course)
        await session.commit()
        return course


@pytest.mark.asyncio
async def test_course_producer_concurrent_replacements_preserve_final_bytes_and_clean_intermediate(
    image_course: Course,
) -> None:
    storage: LocalStorageService = LocalStorageService()
    session: AsyncSession
    async with TestingSessionLocal() as session:
        initial: Course = await CourseService(session).upload_course_image(image_course.id, ImageUpload.create('green'))
        assert initial.photo_path is not None
        original_path: str = initial.photo_path
        await session.commit()
    original_bytes: bytes = await storage.read(original_path)
    barrier: asyncio.Barrier = asyncio.Barrier(2)
    connection_ids: set[int] = set()

    async def replace(color: str) -> tuple[str, bytes]:
        upload: UploadFile = ImageUpload.create(color)
        expected: bytes = upload.file.read()
        upload.file.seek(0)
        session: AsyncSession
        async with TestingSessionLocal() as session:
            connection_id: int = int((await session.execute(text('SELECT pg_backend_pid()'))).scalar_one())
            connection_ids.add(connection_id)
            await barrier.wait()
            updated: Course = await CourseService(session).upload_course_image(image_course.id, upload)
            assert updated.photo_path is not None
            path: str = updated.photo_path
            await session.commit()
            return path, expected

    results: list[tuple[str, bytes]] = await asyncio.gather(replace('red'), replace('blue'))
    assert len(connection_ids) == 2
    assert len({original_path, results[0][0], results[1][0]}) == 3
    final_path: str
    async with TestingSessionLocal() as session:
        persisted: Course | None = await session.get(Course, image_course.id)
        assert persisted is not None and persisted.photo_path is not None
        final_path: str = persisted.photo_path
    expected_by_path: dict[str, bytes] = dict(results)
    assert final_path in expected_by_path
    assert await storage.read(original_path) == original_bytes
    path: str
    expected: bytes
    for path, expected in results:
        assert await storage.read(path) == expected
    assert await StorageCleanupWorker().run_once() == 2
    assert await storage.read(final_path) == expected_by_path[final_path]
    with pytest.raises(FileNotFoundError):
        await storage.read(original_path)
    for path, expected in results:
        if path != final_path:
            with pytest.raises(FileNotFoundError):
                await storage.read(path)
    async with TestingSessionLocal() as session:
        persisted: Course | None = await session.get(Course, image_course.id)
        assert persisted is not None and persisted.photo_path == final_path


@pytest.mark.asyncio
@pytest.mark.parametrize('failure_mode', ['rollback', 'write_failure'])
async def test_course_producer_failed_replacement_preserves_old_reference_and_recovers_orphan(
    image_course: Course, failure_mode: str, monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage: LocalStorageService = LocalStorageService()
    session: AsyncSession
    async with TestingSessionLocal() as session:
        initial: Course = await CourseService(session).upload_course_image(image_course.id, ImageUpload.create('green'))
        assert initial.photo_path is not None
        old_path: str = initial.photo_path
        await session.commit()
    old_bytes: bytes = await storage.read(old_path)
    original_write: Callable[[LocalStorageService, str, bytes], None] = LocalStorageService._write
    written_keys: list[str] = []

    def fail_after_write(instance: LocalStorageService, key: str, content: bytes) -> None:
        original_write(instance, key, content)
        written_keys.append(key)
        raise OSError('synthetic course write failure')

    if failure_mode == 'write_failure':
        monkeypatch.setattr(LocalStorageService, '_write', fail_after_write)
    async with TestingSessionLocal() as session:
        if failure_mode == 'write_failure':
            with pytest.raises(OSError, match='synthetic course write failure'):
                await CourseService(session).upload_course_image(image_course.id, ImageUpload.create('red'))
        else:
            updated: Course = await CourseService(session).upload_course_image(image_course.id, ImageUpload.create('red'))
            assert updated.photo_path is not None
            written_keys.append(storage.canonical_key(updated.photo_path))
        await session.rollback()
    async with TestingSessionLocal() as session:
        persisted: Course | None = await session.get(Course, image_course.id)
        assert persisted is not None and persisted.photo_path == old_path
        stages: list[StorageIntent] = list((await session.execute(select(StorageIntent))).scalars())
    assert len(stages) == 1
    assert stages[0].purpose == 'stage' and stages[0].state == 'pending'
    assert stages[0].object_key == written_keys[0]
    assert await storage.read(old_path) == old_bytes
    assert await storage.read(stages[0].object_key)
    await StorageCleanupWorker().run_once(datetime.now(timezone.utc) + timedelta(hours=1))
    assert await storage.read(old_path) == old_bytes
    with pytest.raises(FileNotFoundError):
        await storage.read(stages[0].object_key)
    async with TestingSessionLocal() as session:
        persisted: Course | None = await session.get(Course, image_course.id)
        assert persisted is not None and persisted.photo_path == old_path
        assert list((await session.execute(select(StorageIntent))).scalars()) == []


@pytest.mark.asyncio
async def test_avatar_producer_failed_second_physical_write_preserves_both_old_assets_and_recovers_stages(
    test_student: User, monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage: LocalStorageService = LocalStorageService()
    session: AsyncSession
    async with TestingSessionLocal() as session:
        initial: User = await UserService(session).upload_avatar(test_student.id, ImageUpload.create('green'))
        assert initial.photo_path is not None and initial.thumbnail_path is not None
        old_photo: str = initial.photo_path
        old_thumbnail: str = initial.thumbnail_path
        await session.commit()
    old_photo_bytes: bytes = await storage.read(old_photo)
    old_thumbnail_bytes: bytes = await storage.read(old_thumbnail)
    original_write: Callable[[LocalStorageService, str, bytes], None] = LocalStorageService._write
    written_keys: list[str] = []

    def fail_second_write(instance: LocalStorageService, key: str, content: bytes) -> None:
        original_write(instance, key, content)
        written_keys.append(key)
        if len(written_keys) == 2:
            raise OSError('synthetic second physical write failure')

    monkeypatch.setattr(LocalStorageService, '_write', fail_second_write)
    async with TestingSessionLocal() as session:
        with pytest.raises(OSError, match='synthetic second physical write failure'):
            await UserService(session).upload_avatar(test_student.id, ImageUpload.create('red'))
        await session.rollback()
    async with TestingSessionLocal() as session:
        persisted: User | None = await session.get(User, test_student.id)
        assert persisted is not None
        assert (persisted.photo_path, persisted.thumbnail_path) == (old_photo, old_thumbnail)
        stages: list[StorageIntent] = list((await session.execute(select(StorageIntent))).scalars())
    assert len(stages) == 2
    assert len(set(written_keys)) == 2
    assert {intent.object_key for intent in stages} == set(written_keys)
    assert all(intent.purpose == 'stage' and intent.state == 'pending' for intent in stages)
    assert await storage.read(old_photo) == old_photo_bytes
    assert await storage.read(old_thumbnail) == old_thumbnail_bytes
    key: str
    for key in written_keys:
        assert await storage.read(key)
    assert await StorageCleanupWorker().run_once(datetime.now(timezone.utc) + timedelta(hours=1)) == 2
    for key in written_keys:
        with pytest.raises(FileNotFoundError):
            await storage.read(key)
    assert await storage.read(old_photo) == old_photo_bytes
    assert await storage.read(old_thumbnail) == old_thumbnail_bytes
    async with TestingSessionLocal() as session:
        persisted: User | None = await session.get(User, test_student.id)
        assert persisted is not None
        assert (persisted.photo_path, persisted.thumbnail_path) == (old_photo, old_thumbnail)
        assert list((await session.execute(select(StorageIntent))).scalars()) == []
