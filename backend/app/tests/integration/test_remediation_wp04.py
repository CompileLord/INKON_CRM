from pathlib import Path

from google.cloud.storage.acl import ACL
import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.models.document import Document
from app.models.user import User, UserRole
from app.schemas.document import DocumentResponse
from app.services.storage_service import GoogleCloudStorageService


class FakeIAMConfiguration:
    def __init__(self, uniform_access: bool = False, public_access_prevention: str = "enforced") -> None:
        self.uniform_bucket_level_access_enabled = uniform_access
        self.public_access_prevention = public_access_prevention


class FakePolicy:
    def __init__(self, bindings: list[dict[str, list[str]]]) -> None:
        self.bindings = bindings


class FakeACL(ACL):
    def __init__(self, entities: set[str]) -> None:
        super().__init__()
        self.loaded = True
        for entity_name in entities:
            self.entity(entity_name).grant_read()

    def reload(self) -> None:
        return None

class FakeBlob:
    def __init__(self, name: str, acl_entities: set[str], uniform_access: bool) -> None:
        self.name = name
        self.acl = FakeACL(acl_entities)
        self.uniform_access = uniform_access
        self.cache_control: str = ""
        self.uploaded_bytes: bytes = b""
        self.predefined_acl: str | None = None

    def upload_from_string(self, content: bytes, predefined_acl: str | None = None) -> None:
        self.uploaded_bytes = content
        self.predefined_acl = predefined_acl
        if predefined_acl is not None:
            self.acl = FakeACL({"project-owners"})

    def download_as_bytes(self) -> bytes:
        return self.uploaded_bytes


class FakeBucket:
    def __init__(
        self,
        public_iam: bool = False,
        uniform_access: bool = False,
        public_access_prevention: str = "enforced",
        object_acl_entities: set[str] | None = None,
    ) -> None:
        self.iam_configuration = FakeIAMConfiguration(uniform_access, public_access_prevention)
        members: list[str] = ["allUsers"] if public_iam else []
        self.policy = FakePolicy([{"role": "roles/storage.objectViewer", "members": members}])
        self.object_acl_entities = object_acl_entities or set()
        self.blobs: dict[str, FakeBlob] = {}
        self.policy_requested = False

    def reload(self) -> None:
        return None

    def get_iam_policy(self, requested_policy_version: int) -> FakePolicy:
        assert requested_policy_version == 3
        self.policy_requested = True
        return self.policy

    def blob(self, name: str) -> FakeBlob:
        if name not in self.blobs:
            self.blobs[name] = FakeBlob(name, self.object_acl_entities.copy(), self.iam_configuration.uniform_bucket_level_access_enabled)
        return self.blobs[name]


async def upload_private_document(
    client: AsyncClient,
    administrator: User,
    owner_type: str,
    owner_id: int,
    filename: str,
) -> Response:
    private_bytes: bytes = f"%PDF-1.5\n{filename}\n%%EOF".encode()
    return await client.post(
        "/api/v1/documents/",
        data={"owner_type": owner_type, "owner_id": str(owner_id)},
        files={"file": (filename, private_bytes, "application/pdf")},
        headers={
            "Authorization": f"Bearer {create_access_token(administrator.id, administrator.role)}"
        },
    )


def authorization_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.mark.asyncio
async def test_private_download_matches_document_listing_policy(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
    test_mentor: User,
) -> None:
    other_student: User = User(
        email="wp04-other-student@example.com",
        first_name="Other",
        last_name="Student",
        role=UserRole.STUDENT,
        must_set_password=False,
    )
    other_mentor: User = User(
        email="wp04-other-mentor@example.com",
        first_name="Other",
        last_name="Mentor",
        role=UserRole.MENTOR,
        must_set_password=False,
    )
    accountant: User = User(
        email="wp04-accountant@example.com",
        first_name="Accountant",
        last_name="Staff",
        role=UserRole.ACCOUNTANT,
        must_set_password=False,
    )
    db_session.add_all([other_student, other_mentor, accountant])
    await db_session.commit()

    owned_student_document = await upload_private_document(
        client, test_admin, "student", test_student.id, "owned-student.pdf"
    )
    peer_student_document = await upload_private_document(
        client, test_admin, "student", other_student.id, "peer-student.pdf"
    )
    owned_mentor_document = await upload_private_document(
        client, test_admin, "mentor", test_mentor.id, "owned-mentor.pdf"
    )
    peer_mentor_document = await upload_private_document(
        client, test_admin, "mentor", other_mentor.id, "peer-mentor.pdf"
    )
    assert all(
        response.status_code == 201
        for response in (
            owned_student_document,
            peer_student_document,
            owned_mentor_document,
            peer_mentor_document,
        )
    )
    owned_student_id: int = owned_student_document.json()["id"]
    peer_student_id: int = peer_student_document.json()["id"]
    owned_mentor_id: int = owned_mentor_document.json()["id"]
    peer_mentor_id: int = peer_mentor_document.json()["id"]

    anonymous = await client.get(f"/api/v1/documents/{owned_student_id}/download")
    student_owned = await client.get(
        f"/api/v1/documents/{owned_student_id}/download",
        headers=authorization_headers(test_student),
    )
    student_peer = await client.get(
        f"/api/v1/documents/{peer_student_id}/download",
        headers=authorization_headers(test_student),
    )
    mentor_student = await client.get(
        f"/api/v1/documents/{peer_student_id}/download",
        headers=authorization_headers(test_mentor),
    )
    mentor_owned = await client.get(
        f"/api/v1/documents/{owned_mentor_id}/download",
        headers=authorization_headers(test_mentor),
    )
    mentor_peer = await client.get(
        f"/api/v1/documents/{peer_mentor_id}/download",
        headers=authorization_headers(test_mentor),
    )
    administrator_download = await client.get(
        f"/api/v1/documents/{peer_mentor_id}/download",
        headers=authorization_headers(test_admin),
    )
    accountant_download = await client.get(
        f"/api/v1/documents/{owned_student_id}/download",
        headers=authorization_headers(accountant),
    )

    assert anonymous.status_code == 401
    assert student_owned.status_code == 200
    assert b"owned-student.pdf" in student_owned.content
    assert student_peer.status_code == 404
    assert mentor_student.status_code == 200
    assert b"peer-student.pdf" in mentor_student.content
    assert mentor_owned.status_code == 200
    assert b"owned-mentor.pdf" in mentor_owned.content
    assert mentor_peer.status_code == 404
    assert administrator_download.status_code == 200
    assert b"peer-mentor.pdf" in administrator_download.content
    assert accountant_download.status_code == 403
    assert student_owned.headers["cache-control"] == "no-store, max-age=0, must-revalidate"
    assert "public" not in student_owned.headers["cache-control"]


@pytest.mark.asyncio
async def test_private_download_denies_legacy_path_deleted_records_and_unsafe_files(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
    tmp_path: Path,
) -> None:
    upload = await upload_private_document(
        client, test_admin, "student", test_student.id, "restricted.pdf"
    )
    assert upload.status_code == 201
    document_id: int = upload.json()["id"]
    legacy_path: str = upload.json()["file_path"]
    private_bytes: bytes = b"%PDF-1.5\nrestricted.pdf\n%%EOF"

    legacy_download = await client.get(legacy_path)
    assert legacy_download.is_client_error
    assert private_bytes not in legacy_download.content

    document: Document = await db_session.get(Document, document_id)
    assert document is not None
    original_path: str = document.file_path
    document.file_path = "/storage/student/../../../../etc/passwd"
    await db_session.commit()
    traversal_download = await client.get(
        f"/api/v1/documents/{document_id}/download",
        headers=authorization_headers(test_admin),
    )
    assert traversal_download.status_code == 404
    assert b"root:" not in traversal_download.content

    root: Path = Path(settings.STORAGE_PATH).resolve()
    owner_directory: Path = root / "student" / str(test_student.id)
    external_file: Path = tmp_path / "outside-private.pdf"
    external_file.write_bytes(private_bytes)
    symlink_path: Path = owner_directory / "outside-link.pdf"
    symlink_path.unlink(missing_ok=True)
    symlink_path.symlink_to(external_file)
    document.file_path = str(symlink_path)
    await db_session.commit()
    symlink_download = await client.get(
        f"/api/v1/documents/{document_id}/download",
        headers=authorization_headers(test_admin),
    )
    assert symlink_download.status_code == 404
    assert private_bytes not in symlink_download.content

    document.file_path = original_path
    document.is_deleted = True
    await db_session.commit()
    deleted_download = await client.get(
        f"/api/v1/documents/{document_id}/download",
        headers=authorization_headers(test_admin),
    )
    assert deleted_download.status_code == 404
    assert private_bytes not in deleted_download.content
    symlink_path.unlink()
    external_file.unlink()


@pytest.mark.asyncio
async def test_only_avatar_and_course_assets_remain_public_and_cacheable(
    client: AsyncClient,
) -> None:
    storage_root: Path = Path(settings.STORAGE_PATH)
    avatar_path: Path = storage_root / "avatar" / "47" / "avatar.png"
    course_path: Path = storage_root / "course" / "83" / "course.png"
    avatar_path.parent.mkdir(parents=True, exist_ok=True)
    course_path.parent.mkdir(parents=True, exist_ok=True)
    avatar_path.write_bytes(b"public-avatar-asset")
    course_path.write_bytes(b"public-course-asset")

    avatar_response = await client.get("/storage/avatar/47/avatar.png")
    course_response = await client.get("/storage/course/83/course.png")
    private_directory_response = await client.get("/storage/student/47/private.pdf")

    assert avatar_response.status_code == 200
    assert avatar_response.content == b"public-avatar-asset"
    assert avatar_response.headers["cache-control"] == "public, max-age=86400"
    assert course_response.status_code == 200
    assert course_response.content == b"public-course-asset"
    assert course_response.headers["cache-control"] == "public, max-age=86400"
    assert private_directory_response.status_code == 404
    assert "public" not in private_directory_response.headers["cache-control"]
    avatar_path.unlink()
    course_path.unlink()


def test_gcs_document_response_exposes_only_the_authenticated_download_route() -> None:
    document_values: dict[str, object] = {
            "id": 812,
            "owner_type": "student",
            "owner_id": 41,
            "journal_id": None,
            "file_path": "gs://private-bucket/student/41/secret.pdf",
            "file_name": "secret.pdf",
            "file_type": "application/pdf",
            "file_size": 23,
            "uploaded_by_id": 1,
            "uploaded_at": "2026-10-14T00:00:00Z",
            "is_deleted": False,
        }
    response = DocumentResponse.model_validate(document_values)
    legacy_response = DocumentResponse.model_validate(
        {**document_values, "file_path": "https://storage.googleapis.com/private-bucket/student/41/secret.pdf"}
    )

    assert response.file_path == "/api/v1/documents/812/download"
    assert "private-bucket" not in response.file_path
    assert legacy_response.file_path == "/api/v1/documents/812/download"


def test_gcs_private_upload_rejects_public_bucket_iam() -> None:
    service = GoogleCloudStorageService("private-bucket")
    public_iam_bucket = FakeBucket(public_iam=True)
    service._get_bucket = lambda: public_iam_bucket
    with pytest.raises(PermissionError, match="publicly readable bucket"):
        service._sync_save(b"private-document", "student/41/secret.pdf", True)
    assert public_iam_bucket.policy_requested
    assert not public_iam_bucket.blobs

    unverified_bucket = FakeBucket(public_access_prevention="inherited")
    service._get_bucket = lambda: unverified_bucket
    with pytest.raises(PermissionError, match="enforced public access prevention"):
        service._sync_save(b"private-document", "student/41/secret.pdf", True)
    assert not unverified_bucket.policy_requested
    assert not unverified_bucket.blobs


def test_gcs_private_upload_replaces_public_acl_and_respects_uniform_access() -> None:
    acl_enabled_service = GoogleCloudStorageService("private-bucket")
    acl_enabled_bucket = FakeBucket(object_acl_entities={"allUsers"})
    acl_enabled_service._get_bucket = lambda: acl_enabled_bucket

    acl_enabled_service._sync_save(b"private-document", "student/41/secret.pdf", True)
    acl_enabled_blob = acl_enabled_bucket.blobs["student/41/secret.pdf"]

    assert acl_enabled_blob.predefined_acl == "private"
    assert all(str(entity) != "allUsers" for entity in acl_enabled_blob.acl.get_entities())
    assert acl_enabled_blob.cache_control == "private, no-store"

    uniform_service = GoogleCloudStorageService("private-bucket")
    uniform_bucket = FakeBucket(uniform_access=True, object_acl_entities={"allUsers"})
    uniform_service._get_bucket = lambda: uniform_bucket

    uniform_service._sync_save(b"private-document", "student/41/secret.pdf", True)

    assert uniform_bucket.blobs["student/41/secret.pdf"].predefined_acl is None


def test_gcs_read_rejects_public_object_acl_and_reads_private_object() -> None:
    service = GoogleCloudStorageService("private-bucket")
    public_bucket = FakeBucket(object_acl_entities={"allUsers"})
    service._get_bucket = lambda: public_bucket

    with pytest.raises(PermissionError, match="public object ACL"):
        service._sync_read("student/41/public.pdf")

    private_bucket = FakeBucket()
    service._get_bucket = lambda: private_bucket
    private_blob = private_bucket.blob("student/41/private.pdf")
    private_blob.upload_from_string(b"authorized-private-bytes", predefined_acl="private")

    assert service._sync_read("student/41/private.pdf") == b"authorized-private-bytes"


@pytest.mark.asyncio
async def test_gcs_legacy_object_path_is_readable_but_bucket_mismatch_is_rejected() -> None:
    service = GoogleCloudStorageService("private-bucket")
    legacy_url = "https://storage.googleapis.com/private-bucket/student/41/secret.pdf"
    assert service._blob_name(legacy_url) == "student/41/secret.pdf"
    bucket = FakeBucket()
    service._get_bucket = lambda: bucket
    bucket.blob("student/41/secret.pdf").upload_from_string(
        b"legacy-private-object", predefined_acl="private"
    )
    assert await service.read(legacy_url) == b"legacy-private-object"
    with pytest.raises(ValueError, match="different bucket"):
        service._blob_name("gs://another-bucket/student/41/secret.pdf")


@pytest.mark.asyncio
@pytest.mark.parametrize("public_iam,expected_status", [(False, 200), (True, 503)])
async def test_authenticated_download_reads_gcs_document_through_private_storage(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    monkeypatch: pytest.MonkeyPatch,
    public_iam: bool,
    expected_status: int,
) -> None:
    private_bytes: bytes = b"gcs-authenticated-private-document"
    storage_service = GoogleCloudStorageService("private-bucket")
    bucket = FakeBucket(public_iam=public_iam)
    blob = bucket.blob("student/41/gcs-private.pdf")
    blob.upload_from_string(private_bytes, predefined_acl="private")
    storage_service._get_bucket = lambda: bucket
    monkeypatch.setattr(
        "app.services.document_service.get_storage_service",
        lambda: storage_service,
    )
    document = Document(
        owner_type="student",
        owner_id=test_admin.id,
        journal_id=None,
        file_path="gs://private-bucket/student/41/gcs-private.pdf",
        file_name="gcs-private.pdf",
        file_type="application/pdf",
        file_size=len(private_bytes),
        uploaded_by_id=test_admin.id,
        is_deleted=False,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    response = await client.get(
        f"/api/v1/documents/{document.id}/download",
        headers=authorization_headers(test_admin),
    )

    assert response.status_code == expected_status
    if expected_status == 200:
        assert response.content == private_bytes
    else:
        assert response.json()["detail"] == "Private document storage is unavailable"
        assert private_bytes not in response.content
    assert response.headers["cache-control"] == "no-store, max-age=0, must-revalidate"
    assert "public" not in response.headers["cache-control"]


@pytest.mark.asyncio
async def test_gcs_configuration_preserves_legacy_local_document_read_and_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_bytes: bytes = b"legacy-local-private-document"
    local_path: Path = Path(settings.STORAGE_PATH) / "student" / str(test_student.id) / "wp04-legacy-local.pdf"
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(private_bytes)
    storage_service = GoogleCloudStorageService("private-bucket")
    bucket = FakeBucket()
    storage_service._get_bucket = lambda: bucket
    monkeypatch.setattr(
        "app.services.document_service.get_storage_service",
        lambda: storage_service,
    )
    document = Document(
        owner_type="student",
        owner_id=test_student.id,
        journal_id=None,
        file_path=f"/storage/student/{test_student.id}/wp04-legacy-local.pdf",
        file_name="wp04-legacy-local.pdf",
        file_type="application/pdf",
        file_size=len(private_bytes),
        uploaded_by_id=test_admin.id,
        is_deleted=False,
    )
    db_session.add(document)
    await db_session.commit()
    await db_session.refresh(document)

    with pytest.raises(ValueError, match="authenticated download route"):
        await storage_service.get_url(document.file_path)
    authenticated_download = await client.get(
        f"/api/v1/documents/{document.id}/download",
        headers=authorization_headers(test_admin),
    )
    legacy_public_download = await client.get(document.file_path)
    deletion = await client.delete(
        f"/api/v1/documents/{document.id}",
        headers=authorization_headers(test_admin),
    )

    assert authenticated_download.status_code == 200
    assert authenticated_download.content == private_bytes
    assert "public" not in authenticated_download.headers["cache-control"]
    assert legacy_public_download.status_code == 404
    assert private_bytes not in legacy_public_download.content
    assert deletion.status_code == 204
    assert not local_path.exists()
    assert not bucket.blobs


@pytest.mark.asyncio
async def test_download_never_echoes_invalid_stored_media_type(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
) -> None:
    upload: Response = await upload_private_document(
        client, test_admin, "student", test_student.id, "safe-content-type.pdf"
    )
    assert upload.status_code == 201
    document: Document | None = await db_session.get(Document, upload.json()["id"])
    assert document is not None
    document.file_type = "application/pdf\r\nX-Injected: private"
    await db_session.commit()
    download: Response = await client.get(
        f"/api/v1/documents/{document.id}/download",
        headers=authorization_headers(test_admin),
    )
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/octet-stream"
    assert b"safe-content-type.pdf" in download.content


@pytest.mark.asyncio
async def test_gcs_configuration_preserves_local_uploads_for_notification_attachments(
    client: AsyncClient,
    test_admin: User,
    test_student: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage_service: GoogleCloudStorageService = GoogleCloudStorageService("private-bucket")
    bucket: FakeBucket = FakeBucket()
    storage_service._get_bucket = lambda: bucket
    monkeypatch.setattr("app.services.document_service.get_storage_service", lambda: storage_service)
    upload: Response = await upload_private_document(
        client, test_admin, "student", test_student.id, "local-attachment.pdf"
    )
    assert upload.status_code == 201
    local_path: str = upload.json()["file_path"]
    assert local_path.startswith("/storage/student/")
    attachment: Path = Path(settings.STORAGE_PATH) / local_path.removeprefix("/storage/")
    assert attachment.read_bytes() == b"%PDF-1.5\nlocal-attachment.pdf\n%%EOF"
    assert not bucket.blobs
