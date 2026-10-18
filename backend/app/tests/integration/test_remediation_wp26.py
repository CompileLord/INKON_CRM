import ast
import io
from collections.abc import AsyncIterator, Iterator
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from fastapi import HTTPException, UploadFile
from httpx import AsyncClient, Response
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import deps as deps_module
from app.core.config import settings
from app.core.security import create_access_token
from app.models.course import Course
from app.models.document import Document, DocumentOwnerType
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.services.course_service import CourseService
from app.services.document_service import DocumentService
from app.services.storage_service import (
    LocalStorageService,
    ObjectStorageService,
    StorageService,
    get_storage_service,
    storage_backends,
)
from app.services.user_service import UserService
from app.tests.conftest import TestingSessionLocal
from app.workers import tasks as worker_tasks
from app.workers.storage_cleanup import StorageCleanupWorker

BACKEND_ROOT: Path = Path(__file__).resolve().parents[3]
FAKE_BACKEND_NAME: str = "fake-object-store"


class FakeObjectStoreClient:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.largest_chunk_served: int = 0
        self.signed_requests: list[tuple[str, int]] = []

    async def put_object(self, key: str, content: bytes) -> None:
        if key in self.objects:
            raise FileExistsError(key)
        self.objects[key] = content

    async def get_object(self, key: str) -> bytes:
        if key not in self.objects:
            raise FileNotFoundError(key)
        return self.objects[key]

    async def stream_object(self, key: str, chunk_size: int) -> AsyncIterator[bytes]:
        content: bytes = await self.get_object(key)
        offset: int
        for offset in range(0, len(content), chunk_size):
            chunk: bytes = content[offset:offset + chunk_size]
            self.largest_chunk_served = max(self.largest_chunk_served, len(chunk))
            yield chunk

    async def delete_object(self, key: str) -> bool:
        return self.objects.pop(key, None) is not None

    async def sign_url(self, key: str, ttl_seconds: int) -> str:
        self.signed_requests.append((key, ttl_seconds))
        return f"https://objects.invalid/{key}?expires_in={ttl_seconds}&signature=test"


class FakeTelegramBot:
    def __init__(self) -> None:
        self.messages: list[str] = []
        self.documents: list[tuple[str, bytes, str]] = []

    async def send_message(self, chat_id: str | int, text: str) -> None:
        self.messages.append(text)

    async def send_document(self, chat_id: str | int, document: Any, caption: str) -> None:
        collected: bytearray = bytearray()
        chunk: bytes
        async for chunk in document.read(self):
            collected.extend(chunk)
        self.documents.append((document.filename, bytes(collected), caption))


@pytest.fixture
def object_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeObjectStoreClient]:
    shared_client: FakeObjectStoreClient = FakeObjectStoreClient()
    storage_backends.register(FAKE_BACKEND_NAME, lambda: ObjectStorageService(shared_client))
    monkeypatch.setattr(settings, "STORAGE_BACKEND", FAKE_BACKEND_NAME)
    try:
        yield shared_client
    finally:
        storage_backends.unregister(FAKE_BACKEND_NAME)


@pytest.fixture
def telegram_bot(monkeypatch: pytest.MonkeyPatch) -> FakeTelegramBot:
    bot: FakeTelegramBot = FakeTelegramBot()
    monkeypatch.setattr(worker_tasks, "bot", bot)
    return bot


@pytest_asyncio.fixture
async def journal_with_summary(test_mentor: User, test_student: User) -> Journal:
    session: AsyncSession
    async with TestingSessionLocal() as session:
        student: User | None = await session.get(User, test_student.id)
        assert student is not None
        student.parent_telegram_chat_id = 777
        course: Course = Course(title="Storage", description="storage", start_date=date(2025, 1, 1),
            end_date=date(2026, 1, 1), exam_type="monthly", price=Decimal("10.00"), mentor_id=test_mentor.id)
        session.add(course)
        await session.flush()
        journal: Journal = Journal(course_id=course.id, period_label="1", period_start=date(2025, 1, 1),
            period_end=date(2025, 1, 28), period_type="monthly")
        session.add(journal)
        await session.flush()
        session.add(JournalStudentSummary(journal_id=journal.id, student_id=test_student.id, sum_score=5,
            max_period_score=10, attendance_count=1, total_lessons=2))
        await session.commit()
        return journal


def admin_headers(admin: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(admin.id, admin.role)}"}


def png_upload() -> UploadFile:
    buffer: io.BytesIO = io.BytesIO()
    Image.new("RGB", (30, 40), "red").save(buffer, format="PNG")
    buffer.seek(0)
    return UploadFile(filename="image.png", file=buffer)


async def store_document(storage: StorageService, student: User, journal: Journal, content: bytes, size: int | None = None) -> Document:
    path: str = await storage.save(content, "student", student.id, "report.pdf")
    session: AsyncSession
    async with TestingSessionLocal() as session:
        document: Document = Document(owner_type=DocumentOwnerType.STUDENT, owner_id=student.id, journal_id=journal.id,
            file_path=path, file_name="report.pdf", file_type="application/pdf",
            file_size=len(content) if size is None else size, uploaded_by_id=student.id)
        session.add(document)
        await session.commit()
        return document


def local_owner_directory_exists(owner_type: str, owner_id: int) -> bool:
    return (Path(settings.STORAGE_PATH) / owner_type / str(owner_id)).exists()


def test_configured_backend_name_selects_registered_storage(object_store: FakeObjectStoreClient) -> None:
    selected: StorageService = get_storage_service()
    assert isinstance(selected, ObjectStorageService)
    assert selected.client is object_store
    assert isinstance(deps_module.get_storage_service(), ObjectStorageService)


def test_local_backend_is_default_and_unknown_backend_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    assert isinstance(get_storage_service(), LocalStorageService)
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "not-registered")
    with pytest.raises(RuntimeError):
        get_storage_service()


@pytest.mark.asyncio
async def test_upload_on_api_instance_a_is_downloadable_on_instance_b_without_local_disk(
    client: AsyncClient, object_store: FakeObjectStoreClient, test_admin: User, test_student: User,
) -> None:
    content: bytes = b"%PDF-1.5\nshared bucket attachment"
    uploaded: Response = await client.post("/api/v1/documents/", data={"owner_type": "student", "owner_id": test_student.id},
        files={"file": ("report.pdf", content, "application/pdf")}, headers=admin_headers(test_admin))
    assert uploaded.status_code == 201
    key: str = get_storage_service().canonical_key(uploaded.json()["file_path"])
    assert object_store.objects[key] == content
    assert not local_owner_directory_exists("student", test_student.id)
    downloaded: Response = await client.get(f"/api/v1/documents/{uploaded.json()['id']}/download",
        headers=admin_headers(test_admin))
    assert downloaded.status_code == 200
    assert downloaded.content == content
    session: AsyncSession
    async with TestingSessionLocal() as session:
        instance_b: DocumentService = DocumentService(session, ObjectStorageService(object_store))
        document: Document
        stored_content: bytes
        document, stored_content = await instance_b.read_document(uploaded.json()["id"], test_admin)
        assert stored_content == content


@pytest.mark.asyncio
async def test_denied_missing_deleted_and_foreign_objects_remain_inaccessible(
    client: AsyncClient, object_store: FakeObjectStoreClient, test_admin: User, test_student: User, test_mentor: User,
) -> None:
    content: bytes = b"%PDF-1.5\nprivate"
    uploaded: Response = await client.post("/api/v1/documents/", data={"owner_type": "mentor", "owner_id": test_mentor.id},
        files={"file": ("private.pdf", content, "application/pdf")}, headers=admin_headers(test_admin))
    document_id: int = uploaded.json()["id"]
    student_headers: dict[str, str] = admin_headers(test_student)
    assert (await client.get(f"/api/v1/documents/{document_id}/download", headers=student_headers)).status_code == 404
    assert (await client.get(f"/api/v1/documents/{document_id}/download")).status_code in (401, 403)
    key: str = get_storage_service().canonical_key(uploaded.json()["file_path"])
    object_store.objects.pop(key)
    assert (await client.get(f"/api/v1/documents/{document_id}/download", headers=admin_headers(test_admin))).status_code == 404
    reuploaded: Response = await client.post("/api/v1/documents/", data={"owner_type": "mentor", "owner_id": test_mentor.id},
        files={"file": ("private.pdf", content, "application/pdf")}, headers=admin_headers(test_admin))
    deleted: Response = await client.delete(f"/api/v1/documents/{reuploaded.json()['id']}", headers=admin_headers(test_admin))
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/documents/{reuploaded.json()['id']}/download", headers=admin_headers(test_admin))).status_code == 404


@pytest.mark.asyncio
async def test_document_path_owned_by_another_owner_is_never_read(
    object_store: FakeObjectStoreClient, test_admin: User, test_student: User, test_mentor: User,
) -> None:
    storage: ObjectStorageService = ObjectStorageService(object_store)
    foreign_path: str = await storage.save(b"%PDF-1.5\nforeign", "mentor", test_mentor.id, "foreign.pdf")
    session: AsyncSession
    async with TestingSessionLocal() as session:
        document: Document = Document(owner_type=DocumentOwnerType.STUDENT, owner_id=test_student.id, file_path=foreign_path,
            file_name="foreign.pdf", file_type="application/pdf", file_size=5, uploaded_by_id=test_admin.id)
        session.add(document)
        await session.commit()
        with pytest.raises(HTTPException) as denied:
            await DocumentService(session, storage).read_document(document.id, test_admin)
        assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_deleting_document_removes_object_from_configured_store(
    object_store: FakeObjectStoreClient, test_admin: User, test_student: User, client: AsyncClient,
) -> None:
    uploaded: Response = await client.post("/api/v1/documents/", data={"owner_type": "student", "owner_id": test_student.id},
        files={"file": ("report.pdf", b"%PDF-1.5\ndelete me", "application/pdf")}, headers=admin_headers(test_admin))
    await client.delete(f"/api/v1/documents/{uploaded.json()['id']}", headers=admin_headers(test_admin))
    assert len(object_store.objects) == 1
    assert await StorageCleanupWorker().run_once() == 1
    assert object_store.objects == {}


@pytest.mark.asyncio
async def test_avatar_and_course_image_use_configured_store_and_replacement_cleans_it(
    object_store: FakeObjectStoreClient, test_student: User, test_mentor: User, db_session: AsyncSession,
) -> None:
    updated: User = await UserService(db_session).upload_avatar(test_student.id, png_upload())
    assert get_storage_service().canonical_key(updated.photo_path or "") in object_store.objects
    assert len(object_store.objects) == 2
    first_photo_key: str = get_storage_service().canonical_key(updated.photo_path or "")
    await UserService(db_session).upload_avatar(test_student.id, png_upload())
    await db_session.commit()
    assert await StorageCleanupWorker().run_once() == 2
    assert first_photo_key not in object_store.objects
    course: Course = Course(title="Image", description="image", start_date=date(2025, 1, 1), end_date=date(2026, 1, 1),
        exam_type="monthly", price=Decimal("10.00"), mentor_id=test_mentor.id)
    db_session.add(course)
    await db_session.commit()
    updated_course: Course = await CourseService(db_session).upload_course_image(course.id, png_upload())
    assert get_storage_service().canonical_key(updated_course.photo_path or "") in object_store.objects
    assert not local_owner_directory_exists("avatar", test_student.id)
    assert not local_owner_directory_exists("course", course.id)


@pytest.mark.asyncio
async def test_injected_storage_is_used_instead_of_a_local_constructor(
    object_store: FakeObjectStoreClient, test_student: User, db_session: AsyncSession,
) -> None:
    injected_client: FakeObjectStoreClient = FakeObjectStoreClient()
    updated: User = await UserService(db_session, ObjectStorageService(injected_client)).upload_avatar(test_student.id, png_upload())
    assert get_storage_service().canonical_key(updated.photo_path or "") in injected_client.objects
    assert object_store.objects == {}


@pytest.mark.asyncio
async def test_separate_worker_streams_attachment_from_shared_object_store(
    object_store: FakeObjectStoreClient, telegram_bot: FakeTelegramBot, test_student: User, journal_with_summary: Journal,
) -> None:
    content: bytes = b"%PDF-1.5\n" + b"x" * 200_000
    await store_document(ObjectStorageService(object_store), test_student, journal_with_summary, content)
    assert not local_owner_directory_exists("student", test_student.id)
    await worker_tasks.send_exam_result_notification_task({}, test_student.id, journal_with_summary.id)
    assert telegram_bot.messages == []
    assert len(telegram_bot.documents) == 1
    filename: str
    delivered: bytes
    caption: str
    filename, delivered, caption = telegram_bot.documents[0]
    assert filename == "report.pdf"
    assert delivered == content
    assert 0 < object_store.largest_chunk_served <= 64 * 1024


@pytest.mark.asyncio
async def test_worker_sends_text_only_when_object_was_deleted(
    object_store: FakeObjectStoreClient, telegram_bot: FakeTelegramBot, test_student: User, journal_with_summary: Journal,
) -> None:
    document: Document = await store_document(ObjectStorageService(object_store), test_student, journal_with_summary, b"%PDF-1.5\ngone")
    object_store.objects.clear()
    await worker_tasks.send_exam_result_notification_task({}, test_student.id, journal_with_summary.id)
    assert telegram_bot.documents == []
    assert len(telegram_bot.messages) == 1
    assert document.id is not None


@pytest.mark.asyncio
async def test_large_attachment_gets_expiring_private_url_never_permanent_public_path(
    object_store: FakeObjectStoreClient, telegram_bot: FakeTelegramBot, test_student: User, journal_with_summary: Journal,
) -> None:
    document: Document = await store_document(ObjectStorageService(object_store), test_student, journal_with_summary,
        b"%PDF-1.5\nlarge", size=60 * 1024 * 1024)
    await worker_tasks.send_exam_result_notification_task({}, test_student.id, journal_with_summary.id)
    assert telegram_bot.documents == []
    assert len(object_store.signed_requests) == 1
    signed_key: str
    time_to_live: int
    signed_key, time_to_live = object_store.signed_requests[0]
    assert 0 < time_to_live <= 3600
    assert "expires_in=" in telegram_bot.messages[0]
    assert "/storage/" not in telegram_bot.messages[0]
    assert signed_key == get_storage_service().canonical_key(document.file_path)


@pytest.mark.asyncio
async def test_local_backend_large_attachment_never_publishes_a_permanent_link(
    telegram_bot: FakeTelegramBot, test_student: User, journal_with_summary: Journal,
) -> None:
    await store_document(LocalStorageService(), test_student, journal_with_summary, b"%PDF-1.5\nlarge", size=60 * 1024 * 1024)
    await worker_tasks.send_exam_result_notification_task({}, test_student.id, journal_with_summary.id)
    assert len(telegram_bot.messages) == 1
    assert "/storage/" not in telegram_bot.messages[0]


@pytest.mark.asyncio
async def test_local_backend_worker_still_delivers_attachment(
    telegram_bot: FakeTelegramBot, test_student: User, journal_with_summary: Journal,
) -> None:
    content: bytes = b"%PDF-1.5\nlocal"
    await store_document(LocalStorageService(), test_student, journal_with_summary, content)
    await worker_tasks.send_exam_result_notification_task({}, test_student.id, journal_with_summary.id)
    assert [item[1] for item in telegram_bot.documents] == [content]


@pytest.mark.asyncio
async def test_local_and_object_streams_yield_identical_bounded_chunks(object_store: FakeObjectStoreClient) -> None:
    content: bytes = bytes(range(256)) * 2000
    local: LocalStorageService = LocalStorageService()
    local_path: str = await local.save(content, "avatar", 4242, "stream.png")
    object_path: str = await ObjectStorageService(object_store).save(content, "avatar", 4242, "stream.png")
    local_chunks: list[bytes] = [chunk async for chunk in local.stream(local_path, 4096)]
    object_chunks: list[bytes] = [chunk async for chunk in ObjectStorageService(object_store).stream(object_path, 4096)]
    assert b"".join(local_chunks) == content == b"".join(object_chunks)
    assert max(len(chunk) for chunk in local_chunks) <= 4096
    assert max(len(chunk) for chunk in object_chunks) <= 4096
    await local.delete(local_path)


@pytest.mark.asyncio
async def test_local_stream_of_missing_or_invalid_key_raises_without_leaking_descriptors() -> None:
    local: LocalStorageService = LocalStorageService()
    with pytest.raises(FileNotFoundError):
        [chunk async for chunk in local.stream("/storage/avatar/9999/missing.png")]
    with pytest.raises(ValueError):
        [chunk async for chunk in local.stream("/storage/avatar/1/../../etc/passwd")]


@pytest.mark.asyncio
async def test_local_private_url_is_unavailable_and_key_is_validated() -> None:
    local: LocalStorageService = LocalStorageService()
    assert await local.create_private_url("/storage/student/1/file.pdf") is None
    with pytest.raises(ValueError):
        await local.create_private_url("/storage/../secret")


@pytest.mark.asyncio
async def test_object_service_rejects_invalid_keys_before_touching_the_store(object_store: FakeObjectStoreClient) -> None:
    storage: ObjectStorageService = ObjectStorageService(object_store)
    with pytest.raises(ValueError):
        await storage.read("/storage/../../secret")
    with pytest.raises(ValueError):
        await storage.write_reserved(b"x", "other/1/file.pdf")
    with pytest.raises(ValueError):
        await storage.create_private_url("student/0/file.pdf")
    assert object_store.objects == {}
    assert object_store.signed_requests == []


def test_business_services_workers_and_routers_never_construct_local_storage_directly() -> None:
    inspected_files: list[str] = [
        "app/services/document_service.py", "app/services/user_service.py", "app/services/course_service.py",
        "app/services/storage_lifecycle_service.py", "app/workers/tasks.py", "app/workers/storage_cleanup.py",
        "app/workers/settings.py", "app/api/v1/documents.py", "app/api/v1/users.py", "app/api/v1/courses.py",
    ]
    forbidden_names: set[str] = {"LocalStorageService", "LocalDocumentFileStorage", "FSInputFile"}
    offenders: list[str] = []
    relative_path: str
    for relative_path in inspected_files:
        tree: ast.Module = ast.parse((BACKEND_ROOT / relative_path).read_text())
        node: ast.AST
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in forbidden_names:
                offenders.append(f"{relative_path}:{node.id}")
            if isinstance(node, ast.Attribute) and node.attr == "_get_absolute_path":
                offenders.append(f"{relative_path}:{node.attr}")
    assert offenders == []


@pytest.mark.asyncio
async def test_object_store_selection_applies_to_dependency_wiring(
    object_store: FakeObjectStoreClient, client: AsyncClient, test_admin: User, test_student: User,
) -> None:
    uploaded: Response = await client.post("/api/v1/documents/", data={"owner_type": "student", "owner_id": test_student.id},
        files={"file": ("report.pdf", b"%PDF-1.5\nwired", "application/pdf")}, headers=admin_headers(test_admin))
    assert uploaded.status_code == 201
    session: AsyncSession
    async with TestingSessionLocal() as session:
        stored: Document | None = (await session.execute(select(Document))).scalars().first()
        assert stored is not None
        assert get_storage_service().canonical_key(stored.file_path) in object_store.objects
