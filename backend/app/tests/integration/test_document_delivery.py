from pathlib import Path
from uuid import uuid4

import pytest
from httpx import AsyncClient
from httpx import ASGITransport
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.models.document import Document, DocumentOwnerType
from app.models.user import User, UserRole
from app.services.public_media_files import PublicMediaFiles
from app.services.document_file_storage import LocalDocumentFileStorage


class DocumentFixtures:
    @staticmethod
    def headers(user: User | None) -> dict[str, str]:
        return {} if user is None else {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    async def upload(client: AsyncClient, administrator: User, owner: User, content: bytes, filename: str = "report.pdf") -> dict:
        response = await client.post(
            "/api/v1/documents/", headers=DocumentFixtures.headers(administrator),
            data={"owner_type": owner.role.value, "owner_id": owner.id},
            files={"file": (filename, content, "application/pdf")}
        )
        assert response.status_code == 201, response.text
        return response.json()


@pytest.mark.asyncio
async def test_document_download_preserves_exact_role_policy(
    client: AsyncClient, db_session: AsyncSession, test_admin: User,
    test_student: User, test_mentor: User, test_accountant: User
) -> None:
    other_student = User(email="other-download-student@example.com", first_name="Other", last_name="Student", role=UserRole.STUDENT, must_set_password=False)
    other_mentor = User(email="other-download-mentor@example.com", first_name="Other", last_name="Mentor", role=UserRole.MENTOR, must_set_password=False)
    db_session.add_all([other_student, other_mentor])
    await db_session.commit()
    for owner in (test_student, other_student, test_mentor, other_mentor):
        content = b"%PDF-1.7\n" + str(owner.id).encode()
        document = await DocumentFixtures.upload(client, test_admin, owner, content)
        for viewer in (test_admin, test_student, other_student, test_mentor, other_mentor, test_accountant, None):
            response = await client.get(f"/api/v1/documents/{document['id']}/download", headers=DocumentFixtures.headers(viewer))
            if viewer is None:
                expected_status = 401
            elif viewer.role == UserRole.SUPERADMIN:
                expected_status = 200
            elif viewer.role == UserRole.STUDENT:
                expected_status = 200 if owner.role == UserRole.STUDENT and owner.id == viewer.id else 403
            elif viewer.role == UserRole.MENTOR:
                expected_status = 200 if owner.role == UserRole.STUDENT or owner.id == viewer.id else 403
            else:
                expected_status = 403
            assert response.status_code == expected_status, (owner.id, viewer.id if viewer else None, response.text)
            if expected_status == 200:
                assert response.content == content
                assert response.headers["content-type"] == "application/octet-stream"
                assert response.headers["content-disposition"].startswith("attachment;")
                assert "report.pdf" in response.headers["content-disposition"]
                assert "no-store" in response.headers["cache-control"]
                assert response.headers["x-content-type-options"] == "nosniff"
            else:
                assert response.content != content
        assert (await client.get(document["file_path"])).status_code == 404


@pytest.mark.asyncio
async def test_duplicate_document_names_keep_distinct_bytes_and_deleted_files_are_denied(
    client: AsyncClient, test_admin: User, test_student: User
) -> None:
    first = await DocumentFixtures.upload(client, test_admin, test_student, b"%PDF-1.7\nfirst")
    second = await DocumentFixtures.upload(client, test_admin, test_student, b"%PDF-1.7\nsecond")
    assert first["file_path"] != second["file_path"]
    headers = DocumentFixtures.headers(test_student)
    assert (await client.get(f"/api/v1/documents/{first['id']}/download", headers=headers)).content == b"%PDF-1.7\nfirst"
    assert (await client.get(f"/api/v1/documents/{second['id']}/download", headers=headers)).content == b"%PDF-1.7\nsecond"
    assert (await client.delete(f"/api/v1/documents/{first['id']}", headers=DocumentFixtures.headers(test_admin))).status_code == 204
    assert (await client.get(f"/api/v1/documents/{first['id']}/download", headers=headers)).status_code == 404
    assert (await client.get(f"/api/v1/documents/{second['id']}/download", headers=headers)).content == b"%PDF-1.7\nsecond"
    stored_path = Path(settings.STORAGE_PATH) / second["file_path"].removeprefix("/storage/")
    stored_path.unlink()
    assert (await client.get(f"/api/v1/documents/{second['id']}/download", headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_legacy_document_paths_and_public_media_have_separate_boundaries(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User
) -> None:
    root = Path(settings.STORAGE_PATH).resolve()
    owner_directory = root / "student" / str(test_student.id)
    owner_directory.mkdir(parents=True, exist_ok=True)
    basename = f"legacy-{uuid4().hex}.pdf"
    private_file = owner_directory / basename
    private_file.write_bytes(b"%PDF-1.7\nlegacy")
    document = Document(owner_type=DocumentOwnerType.STUDENT, owner_id=test_student.id, file_path=f"/storage/student/{test_student.id}/{basename}", file_name="договор.pdf", file_type="application/pdf", file_size=15, uploaded_by_id=test_admin.id)
    db_session.add(document)
    await db_session.commit()
    response = await client.get(f"/api/v1/documents/{document.id}/download", headers=DocumentFixtures.headers(test_student))
    assert response.status_code == 200
    assert response.content == private_file.read_bytes()
    assert "filename*=utf-8''" in response.headers["content-disposition"]
    for directory in ("avatar", "course"):
        public_file = root / directory / f"public-{uuid4().hex}.png"
        public_file.write_bytes(b"public-image")
        public_url = f"/storage/{directory}/{public_file.name}"
        assert (await client.get(public_url)).content == b"public-image"
        alias = public_file.with_name(f"alias-{uuid4().hex}.pdf")
        alias.symlink_to(private_file)
        assert (await client.get(f"/storage/{directory}/{alias.name}")).status_code == 404
        assert (await client.get(f"/storage/{directory}/%2e%2e/student/{test_student.id}/{basename}")).status_code == 404
        public_file.unlink()
        alias.unlink()
    for path in (document.file_path, document.file_path.replace("/student/", "/%73tudent/"), f"/storage/student/{test_student.id}/%2e/{basename}"):
        assert (await client.get(path)).status_code == 404


@pytest.mark.asyncio
async def test_document_download_rejects_stored_traversal_and_symlink_escape(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, tmp_path: Path
) -> None:
    root = Path(settings.STORAGE_PATH).resolve()
    owner_directory = root / "student" / str(test_student.id)
    owner_directory.mkdir(parents=True, exist_ok=True)
    outside_file = tmp_path / "outside.pdf"
    outside_file.write_bytes(b"secret-outside")
    alias = owner_directory / f"escape-{uuid4().hex}.pdf"
    alias.symlink_to(outside_file)
    paths = (f"/storage/student/{test_student.id}/{alias.name}", f"/storage/student/{test_student.id}/../../avatar/private.pdf", str(outside_file), "https://example.com/private.pdf")
    for stored_path in paths:
        document = Document(owner_type=DocumentOwnerType.STUDENT, owner_id=test_student.id, file_path=stored_path, file_name="report.pdf", file_type="application/pdf", file_size=14, uploaded_by_id=test_admin.id)
        db_session.add(document)
        await db_session.commit()
        response = await client.get(f"/api/v1/documents/{document.id}/download", headers=DocumentFixtures.headers(test_admin))
        assert response.status_code == 404
        assert response.content != outside_file.read_bytes()
    alias.unlink()


@pytest.mark.asyncio
async def test_symlinked_public_root_cannot_serve_private_documents(tmp_path: Path) -> None:
    private_directory = tmp_path / "student" / "1"
    private_directory.mkdir(parents=True)
    (private_directory / "private.pdf").write_bytes(b"private bytes")
    (tmp_path / "avatar").symlink_to(private_directory, target_is_directory=True)
    application = FastAPI()
    application.mount("/storage/avatar", PublicMediaFiles(str(tmp_path), "avatar"))
    async with AsyncClient(transport=ASGITransport(app=application), base_url="http://test") as client:
        response = await client.get("/storage/avatar/private.pdf")
    assert response.status_code == 404
    assert response.content != b"private bytes"


@pytest.mark.asyncio
async def test_document_storage_rejects_symlinked_owner_before_writing(tmp_path: Path) -> None:
    storage_root = tmp_path / "storage"
    outside_directory = tmp_path / "outside"
    storage_root.mkdir()
    outside_directory.mkdir()
    (storage_root / "student").symlink_to(outside_directory, target_is_directory=True)
    storage = LocalDocumentFileStorage(str(storage_root))
    with pytest.raises(ValueError):
        await storage.save(b"private bytes", "student", 1, "file.pdf")
    assert list(outside_directory.iterdir()) == []
