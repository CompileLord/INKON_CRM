import asyncio
import importlib
import re
import secrets
import socket
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from urllib.parse import quote, urlencode, urlsplit
from uuid import uuid4

import pytest
import arq
from redis import Redis as SyncRedis
from arq.jobs import Job
from arq.worker import Worker
from redis.asyncio import Redis
from redis.exceptions import AuthenticationError, ConnectionError as RedisConnectionError
from redis.exceptions import NoPermissionError, RedisError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

import app.core.redis as redis_module
import app.services.document_service as document_service_module
import app.services.email_service as email_service_module
import app.workers.settings as worker_settings_module
from app.core.config import settings
from app.models.user import User
from app.services.document_service import DocumentService
from app.services.email_service import EmailService


BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
SETUP_SCRIPT_PATH: Path = BACKEND_ROOT / "scripts/setup_free_tier_vm.sh"
REDIS_CONFIGURATION_PATH: Path = BACKEND_ROOT / "config/redis.conf.example"
ENVIRONMENT_EXAMPLE_PATH: Path = BACKEND_ROOT / ".env.example"


class RedisContractProbe:
    @staticmethod
    def configuration_type() -> type[Any]:
        configuration_type: type[Any] | None = getattr(
            redis_module,
            "RedisConnectionConfiguration",
            None,
        )
        assert configuration_type is not None, "the typed Redis connection contract must exist"
        return configuration_type

    @classmethod
    def from_url(cls, redis_url: str) -> Any:
        return cls.configuration_type().from_url(redis_url)


class DisposableRedisService:
    def __init__(self, temporary_directory: Path) -> None:
        self.temporary_directory: Path = temporary_directory
        self.ca_certificate_path: Path = temporary_directory / "ca.crt"
        self.private_key_path: Path = temporary_directory / "server.key"
        self.server_certificate_path: Path = temporary_directory / "server.crt"
        self.acl_path: Path = temporary_directory / "users.acl"
        self.configuration_path: Path = temporary_directory / "redis.conf"
        self.log_path: Path = temporary_directory / "redis.log"
        self.username: str = "wp13_user"
        self.password: str = secrets.token_hex(32)
        self.port: int = self._available_port()
        self.url: str = self._create_url()
        self.process: subprocess.Popen[bytes] | None = None
        self._create_certificates()
        self._create_acl()
        self._create_configuration()
        self._start_server()

    @staticmethod
    def _available_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])

    def _create_url(self) -> str:
        query_parameters: dict[str, str] = {
            "ssl_ca_certs": str(self.ca_certificate_path),
            "ssl_cert_reqs": "required",
            "ssl_check_hostname": "true",
        }
        encoded_query: str = urlencode(query_parameters)
        return (
            f"rediss://{quote(self.username)}:{quote(self.password)}@localhost:"
            f"{self.port}/11?{encoded_query}"
        )

    def _create_certificates(self) -> None:
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=localhost",
                "-addext",
                "subjectAltName=DNS:localhost",
                "-keyout",
                str(self.private_key_path),
                "-out",
                str(self.server_certificate_path),
            ],
            capture_output=True,
            check=True,
        )
        self.ca_certificate_path.write_bytes(self.server_certificate_path.read_bytes())

    def _create_acl(self) -> None:
        self.acl_path.write_text(
            "\n".join(
                (
                    "user default off",
                    f"user {self.username} on >{self.password} ~* &* +@read +@write "
                    "+@connection +@transaction +@scripting -@admin -flushdb -flushall "
                    "-config -acl -shutdown -replicaof -slaveof -debug +info +time",
                )
            )
            + "\n"
        )
        self.acl_path.chmod(0o600)

    def _create_configuration(self) -> None:
        self.configuration_path.write_text(
            "\n".join(
                (
                    "port 0",
                    f"tls-port {self.port}",
                    f"tls-cert-file {self.server_certificate_path}",
                    f"tls-key-file {self.private_key_path}",
                    f"tls-ca-cert-file {self.ca_certificate_path}",
                    "tls-auth-clients no",
                    f"aclfile {self.acl_path}",
                    "protected-mode yes",
                    f"dir {self.temporary_directory}",
                    'save ""',
                    "appendonly no",
                )
            )
            + "\n"
        )

    def _start_server(self) -> None:
        log_stream = self.log_path.open("wb")
        self.process = subprocess.Popen(
            ["redis-server", str(self.configuration_path)],
            stdout=log_stream,
            stderr=subprocess.STDOUT,
        )
        log_stream.close()
        probe: SyncRedis = SyncRedis.from_url(self.url, decode_responses=True)
        try:
            for _ in range(100):
                if self.process.poll() is not None:
                    raise RuntimeError("The disposable Redis server exited during startup")
                try:
                    if probe.ping():
                        return
                except RedisError:
                    time.sleep(0.05)
            raise RuntimeError("The disposable Redis server did not become ready")
        except Exception:
            self.close()
            raise
        finally:
            probe.close()

    def close(self) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)


@pytest.fixture(scope="session")
def disposable_redis(tmp_path_factory: pytest.TempPathFactory) -> Any:
    service: DisposableRedisService = DisposableRedisService(
        tmp_path_factory.mktemp("wp13-redis")
    )
    try:
        yield service
    finally:
        service.close()


class FakeDocumentDatabase:
    def __init__(self) -> None:
        self.added_documents: list[Any] = []

    async def execute(self, statement: Any) -> Any:
        return FakeSummaryResult()

    def add(self, document: Any) -> None:
        self.added_documents.append(document)

    async def flush(self) -> None:
        return None

    async def refresh(self, document: Any) -> None:
        return None


class FakeSummaryResult:
    def scalars(self) -> "FakeSummaryResult":
        return self

    def first(self) -> SimpleNamespace:
        return SimpleNamespace(exam_score=1)


class FakeDocumentUpload:
    filename: str = "wp13-probe.txt"
    content_type: str = "text/plain"

    async def read(self) -> bytes:
        return b"wp13 synthetic document"


class FakeUploadStorage:
    async def save(
        self,
        content: bytes,
        owner_type: str,
        owner_id: int,
        filename: str,
    ) -> str:
        return f"wp13/{owner_type}/{owner_id}/{filename}"


class FakeDocumentLifecycle:
    def __init__(self, database: Any, storage: FakeUploadStorage) -> None:
        self.storage: FakeUploadStorage = storage

    async def stage(self, content: bytes, owner_type: str, owner_id: int, filename: str) -> tuple[str, str]:
        path: str = await self.storage.save(content, owner_type, owner_id, filename)
        return path, 'wp13-document-stage'

    async def adopt(self, intent_id: str) -> None:
        assert intent_id == 'wp13-document-stage'


async def wp13_harmless_job(ctx: dict[str, Any], marker: str) -> str:
    return marker


class FakeArqPool:
    def __init__(self, enqueue_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]]) -> None:
        self.enqueue_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = enqueue_calls

    async def enqueue_job(self, job_name: str, *args: Any, **kwargs: Any) -> None:
        self.enqueue_calls.append((job_name, args, kwargs))


def test_typed_redis_configuration_preserves_authenticated_tls_database_url() -> None:
    synthetic_url: str = (
        "rediss://wp13_user:wp13-synthetic%3Apassword%40only@localhost:6380/11"
        "?ssl_ca_certs=%2Ftmp%2Fwp13-contract-ca.pem&ssl_cert_reqs=required"
        "&ssl_check_hostname=true"
    )
    configuration: Any = RedisContractProbe.from_url(synthetic_url)
    arq_settings: Any = configuration.create_arq_settings()
    parsed_url = urlsplit(synthetic_url)

    assert configuration.host == parsed_url.hostname
    assert configuration.port == parsed_url.port
    assert configuration.database == 11
    assert configuration.username == "wp13_user"
    assert configuration.password == "wp13-synthetic:password@only"
    assert configuration.tls_enabled is True
    assert arq_settings.database == configuration.database
    assert arq_settings.username == configuration.username
    assert arq_settings.password == configuration.password
    assert arq_settings.ssl is True
    assert arq_settings.ssl_ca_certs == "/tmp/wp13-contract-ca.pem"
    assert arq_settings.ssl_check_hostname is True


@pytest.mark.asyncio
async def test_created_redis_client_owns_and_disconnects_its_connection_pool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    synthetic_url: str = "rediss://wp13_user:synthetic-only@localhost:6380/11"
    client: Redis = RedisContractProbe.from_url(synthetic_url).create_client()
    connection_pool = client.connection_pool
    disconnect: AsyncMock = AsyncMock()
    monkeypatch.setattr(connection_pool, "disconnect", disconnect)

    await client.aclose()

    assert client.auto_close_connection_pool is True
    disconnect.assert_awaited_once_with()


@pytest.mark.asyncio
async def test_unauthenticated_tls_client_cannot_access_isolated_redis(
    disposable_redis: DisposableRedisService,
) -> None:
    parsed_url = urlsplit(disposable_redis.url)
    anonymous_url: str = parsed_url._replace(
        netloc=f"{parsed_url.hostname}:{parsed_url.port}"
    ).geturl()
    anonymous_client: Redis = RedisContractProbe.from_url(anonymous_url).create_client()

    try:
        with pytest.raises(AuthenticationError):
            await anonymous_client.ping()
    finally:
        await anonymous_client.aclose()


@pytest.mark.asyncio
async def test_authenticated_application_user_cannot_run_global_redis_commands(
    disposable_redis: DisposableRedisService,
) -> None:
    client: Redis = RedisContractProbe.from_url(disposable_redis.url).create_client()
    key: str = f"wp13-response-decoding:{uuid4().hex}"

    try:
        await client.set(key, "decoded-value")
        assert await client.get(key) == "decoded-value"
        with pytest.raises(NoPermissionError):
            await client.flushdb()
    finally:
        await client.delete(key)
        await client.aclose()


@pytest.mark.asyncio
async def test_tls_hostname_validation_rejects_certificate_name_mismatch(
    disposable_redis: DisposableRedisService,
) -> None:
    parsed_url = urlsplit(disposable_redis.url)
    mismatched_url: str = parsed_url._replace(
        netloc=(
            f"{quote(disposable_redis.username)}:{quote(disposable_redis.password)}@"
            f"127.0.0.1:{disposable_redis.port}"
        )
    ).geturl()
    client: Redis = RedisContractProbe.from_url(mismatched_url).create_client()

    try:
        with pytest.raises(RedisConnectionError):
            await client.ping()
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_authenticated_application_producer_and_worker_share_tls_redis(
    disposable_redis: DisposableRedisService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configuration: Any = RedisContractProbe.from_url(disposable_redis.url)
    original_redis_url: str = settings.REDIS_URL
    original_testing: bool = settings.TESTING
    monkeypatch.setattr(settings, "REDIS_URL", disposable_redis.url)
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(redis_module, "redis_connection_configuration", configuration)
    await redis_module.close_arq_pool()
    loaded_worker_settings_module = importlib.reload(worker_settings_module)
    marker: str = uuid4().hex
    job_id: str = f"wp13-{uuid4().hex}"

    try:
        await redis_module.enqueue_job("wp13_harmless_job", marker, _job_id=job_id)
        pool = await redis_module.get_arq_pool()
        job: Job = Job(job_id, redis=pool)
        worker: Worker = Worker(
            functions=[wp13_harmless_job],
            redis_settings=loaded_worker_settings_module.WorkerSettings.redis_settings,
            burst=True,
            max_burst_jobs=1,
            handle_signals=False,
            keep_result=30,
        )
        completed_jobs: int = await asyncio.wait_for(worker.run_check(), timeout=10)

        assert completed_jobs == 1
        assert await asyncio.wait_for(job.result(timeout=5), timeout=7) == marker
    finally:
        await redis_module.close_arq_pool()
        monkeypatch.setattr(settings, "REDIS_URL", original_redis_url)
        monkeypatch.setattr(settings, "TESTING", original_testing)
        importlib.reload(worker_settings_module)


@pytest.mark.asyncio
async def test_email_producer_delegates_to_shared_arq_enqueue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    enqueue_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
    independent_pool_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    async def record_enqueue(job_name: str, *args: Any, **kwargs: Any) -> None:
        enqueue_calls.append((job_name, args, kwargs))

    async def stub_create_pool(redis_settings: Any) -> FakeArqPool:
        independent_pool_calls.append(("create_pool", (redis_settings,), {}))
        return FakeArqPool(independent_pool_calls)

    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(email_service_module, "enqueue_job", record_enqueue, raising=False)
    monkeypatch.setattr(email_service_module, "create_pool", stub_create_pool, raising=False)

    await EmailService().enqueue_verification_email("student@example.invalid", "481516")

    assert enqueue_calls == [
        ("send_verification_email_task", ("student@example.invalid", "481516"), {})
    ]
    assert independent_pool_calls == []


@pytest.mark.asyncio
async def test_document_producer_delegates_to_shared_arq_enqueue(
    monkeypatch: pytest.MonkeyPatch,
    test_admin: User,
    test_student: User,
    tmp_path: Path,
) -> None:
    from datetime import date
    from decimal import Decimal

    from sqlalchemy import select

    from app.models.course import Course
    from app.models.document import Document
    from app.models.journal import Journal
    from app.models.journal_student_summary import JournalStudentSummary
    from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
    from app.services.outbox_service import NotificationIntentPayload, OutboxPayloadEncryptor
    from app.services.storage_service import LocalStorageService
    from app.tests.conftest import TestingSessionLocal
    from app.workers.outbox import OutboxWorkerManager

    enqueue_calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
    producer_creations: list[Any] = []
    shared_producer: AsyncMock = AsyncMock()

    async def record_enqueue(job_name: str, *args: Any, **kwargs: Any) -> None:
        enqueue_calls.append((job_name, args, kwargs))

    async def create_shared_producer(redis_settings: Any) -> AsyncMock:
        producer_creations.append(redis_settings)
        return shared_producer

    await redis_module.close_arq_pool()
    shared_producer.enqueue_job.side_effect = record_enqueue
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(arq, "create_pool", create_shared_producer)
    worker: OutboxWorkerManager = OutboxWorkerManager(settings.DATABASE_URL, settings.JWT_SECRET_KEY)
    session: AsyncSession
    try:
        async with TestingSessionLocal() as session:
            course: Course = Course(title="WP13 outbox", description="synthetic", start_date=date(2025, 1, 1),
                end_date=date(2026, 1, 1), exam_type="monthly", price=Decimal("10.00"), mentor_id=test_admin.id)
            session.add(course)
            await session.flush()
            journal: Journal = Journal(course_id=course.id, period_label="1", period_start=date(2025, 1, 1),
                period_end=date(2025, 1, 28), period_type="monthly")
            session.add(journal)
            await session.flush()
            session.add(JournalStudentSummary(journal_id=journal.id, student_id=test_student.id, exam_score=1))
            await session.commit()

        async with TestingSessionLocal() as session:
            service: DocumentService = DocumentService(session, LocalStorageService(str(tmp_path)))
            document: Document = await service.upload_document(
                cast(UploadFile, FakeDocumentUpload()), "student", test_student.id, journal.id, test_admin,
            )
            event: OutboxEvent = (await session.scalars(select(OutboxEvent))).one()
            event_id: int = event.id
            document_id: int = document.id
            assert event.kind == OutboxEventKind.DOCUMENT_NOTIFICATION
            assert event.status == OutboxEventStatus.PENDING
            assert event.correlation_key == f"document:{document.id}"
            assert event.encrypted_payload is not None
            payload: NotificationIntentPayload = NotificationIntentPayload.model_validate_json(
                OutboxPayloadEncryptor(settings.JWT_SECRET_KEY).decrypt(event.encrypted_payload)
            )
            assert (payload.student_id, payload.journal_id) == (test_student.id, journal.id)
            observer: AsyncSession
            async with TestingSessionLocal() as observer:
                assert await observer.get(Document, document.id) is None
                assert await observer.get(OutboxEvent, event.id) is None
            assert await worker.run_once(TestingSessionLocal) == 0
            assert enqueue_calls == []
            assert producer_creations == []
            await session.commit()

        assert await worker.run_once(TestingSessionLocal) == 1
        assert enqueue_calls == [
            ("send_student_document_notification_task", (test_student.id, journal.id),
                {"_job_id": f"outbox-notification:{event_id}"})
        ]
        assert len(producer_creations) == 1
        assert await redis_module.get_arq_pool() is shared_producer
        assert len(producer_creations) == 1
        async with TestingSessionLocal() as session:
            delivered: OutboxEvent | None = await session.get(OutboxEvent, event_id)
            assert delivered is not None
            assert delivered.status == OutboxEventStatus.DELIVERED
            assert len(list((await session.scalars(select(Document))).all())) == 1
            assert await session.get(Document, document_id) is not None
    finally:
        await redis_module.close_arq_pool()
    shared_producer.aclose.assert_awaited_once()


def test_vm_script_binds_redis_loopback_and_does_not_print_credentials() -> None:
    setup_script: str = SETUP_SCRIPT_PATH.read_text()
    redis_configuration: str = REDIS_CONFIGURATION_PATH.read_text()
    environment_example: str = ENVIRONMENT_EXAMPLE_PATH.read_text()
    syntax_check: subprocess.CompletedProcess[str] = subprocess.run(
        ["bash", "-n", str(SETUP_SCRIPT_PATH)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert syntax_check.returncode == 0
    assert re.search(r'-p\s+"127\.0\.0\.1:\$\{REDIS_PORT\}:6379"', setup_script)
    assert "REDIS_URL=redis://${PUBLIC_IP}" not in setup_script
    assert not re.search(r'echo\s+.*\$\{?REDIS_PASSWORD', setup_script)
    assert "+@all" not in setup_script
    assert "-flushdb -flushall -config -acl -shutdown" in setup_script
    generated_username: str = re.search(
        r"REDIS_URL=rediss://([^:]+):%s@", setup_script
    )[1]
    configured_username: str = re.search(r"user ([^ ]+) on >%s", setup_script)[1]
    assert generated_username == configured_username
    assert "port 0" in redis_configuration
    assert "tls-port 6379" in redis_configuration
    assert "tls-auth-clients no" in redis_configuration
    assert "aclfile /data/users.acl" in redis_configuration
    assert "REDIS_HOST=" not in environment_example
    assert "REDIS_PORT=" not in environment_example
    assert "ssl_check_hostname=true" in environment_example
