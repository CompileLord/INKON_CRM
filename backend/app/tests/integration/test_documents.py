import pytest
from pathlib import Path
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.core.config import settings
from app.models.document import Document, DocumentOwnerType
from app.models.user import User
from app.services.storage_service import LocalStorageService


@pytest.mark.asyncio
async def test_upload_document_flow(client: AsyncClient, test_admin: User, test_student: User, test_mentor: User) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Upload valid PDF
    pdf_content = b"%PDF-1.5\n%EOF"
    response = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("test.pdf", pdf_content, "application/pdf")},
        headers=admin_headers
    )
    assert response.status_code == 201
    doc_data = response.json()
    assert doc_data["file_name"] == "test.pdf"
    assert doc_data["file_type"] == "application/pdf"
    assert doc_data["file_size"] == len(pdf_content)

    doc_id = doc_data["id"]

    # 2. Try upload 51MB file -> verify 413
    large_content = b"a" * (51 * 1024 * 1024)
    response_large = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("large.pdf", large_content, "application/pdf")},
        headers=admin_headers
    )
    assert response_large.status_code == 413

    # 3. Try upload text file renamed to .pdf -> verify magic bytes validation blocks it (400)
    spoofed_content = b"hello world this is not a pdf file"
    response_spoofed = await client.post(
        "/api/v1/documents/",
        data={
            "owner_type": "student",
            "owner_id": test_student.id
        },
        files={"file": ("spoofed.pdf", spoofed_content, "application/pdf")},
        headers=admin_headers
    )
    assert response_spoofed.status_code == 400

    # 4. Access Matrix: Student GET should only see own
    student_token = create_access_token(test_student.id, test_student.role)
    student_headers = {"Authorization": f"Bearer {student_token}"}

    list_resp = await client.get("/api/v1/documents/", headers=student_headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()["items"]) == 1

    # Mentor GET should be able to see student's document
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}

    list_resp_m = await client.get("/api/v1/documents/", headers=mentor_headers)
    assert list_resp_m.status_code == 200
    assert len(list_resp_m.json()["items"]) == 1

    # Student tries to DELETE -> verify 403
    del_resp = await client.delete(f"/api/v1/documents/{doc_id}", headers=student_headers)
    assert del_resp.status_code == 403

    # Admin DELETES -> verify 204
    del_resp_admin = await client.delete(f"/api/v1/documents/{doc_id}", headers=admin_headers)
    assert del_resp_admin.status_code == 204


@pytest.mark.asyncio
async def test_document_download_authorization_and_same_name_storage(
    client: AsyncClient,
    test_admin: User,
    test_student: User,
    test_mentor: User,
    test_accountant: User
) -> None:
    async def upload(owner_type: str, owner_id: int, content: bytes) -> dict:
        response = await client.post(
            "/api/v1/documents/",
            data={"owner_type": owner_type, "owner_id": owner_id},
            files={"file": ("same évaluation.pdf", content, "application/pdf")},
            headers={"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
        )
        assert response.status_code == 201
        return response.json()

    first_student_document = await upload("student", test_student.id, b"%PDF first student bytes")
    second_student_document = await upload("student", test_student.id, b"%PDF second student bytes")
    own_mentor_document = await upload("mentor", test_mentor.id, b"%PDF mentor bytes")
    other_student_document = await upload("student", test_student.id + 1000, b"%PDF other student bytes")
    other_mentor_document = await upload("mentor", test_mentor.id + 1000, b"%PDF other mentor bytes")

    assert first_student_document["file_name"] == second_student_document["file_name"] == "same évaluation.pdf"
    assert first_student_document["file_path"] != second_student_document["file_path"]

    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}
    accountant_headers = {"Authorization": f"Bearer {create_access_token(test_accountant.id, test_accountant.role)}"}

    async def download(document_id: int, headers: dict | None = None):
        return await client.get(f"/api/v1/documents/{document_id}/download", headers=headers)

    first_student_download = await download(first_student_document["id"], student_headers)
    second_student_download = await download(second_student_document["id"], student_headers)
    assert first_student_download.status_code == second_student_download.status_code == 200
    assert first_student_download.content == b"%PDF first student bytes"
    assert second_student_download.content == b"%PDF second student bytes"
    assert first_student_download.headers["content-disposition"] == "attachment; filename*=UTF-8''same%20%C3%A9valuation.pdf"
    assert first_student_download.headers["content-type"] == "application/octet-stream"
    assert first_student_download.headers["cache-control"] == "no-store, max-age=0, must-revalidate"
    assert first_student_download.headers["x-content-type-options"] == "nosniff"
    assert (await download(first_student_document["id"], admin_headers)).content == b"%PDF first student bytes"
    assert (await download(first_student_document["id"], mentor_headers)).content == b"%PDF first student bytes"
    assert (await download(own_mentor_document["id"], mentor_headers)).content == b"%PDF mentor bytes"
    assert (await download(other_student_document["id"], student_headers)).status_code == 403
    assert (await download(other_mentor_document["id"], mentor_headers)).status_code == 403
    assert (await download(first_student_document["id"], accountant_headers)).status_code == 403
    assert (await download(first_student_document["id"])).status_code == 401


@pytest.mark.asyncio
async def test_document_download_hides_deleted_missing_and_escaped_files(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User,
    tmp_path: Path
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}

    async def upload_document() -> dict:
        response = await client.post(
            "/api/v1/documents/",
            data={"owner_type": "student", "owner_id": test_student.id},
            files={"file": ("private.pdf", b"%PDF private bytes", "application/pdf")},
            headers=admin_headers
        )
        assert response.status_code == 201
        return response.json()

    missing_document = await upload_document()
    missing_path = Path(settings.STORAGE_PATH) / missing_document["file_path"].removeprefix("/storage/")
    missing_path.unlink()
    missing_response = await client.get(
        f"/api/v1/documents/{missing_document['id']}/download",
        headers=student_headers
    )
    assert missing_response.status_code == 404

    escaped_document = await upload_document()
    escaped_path = Path(settings.STORAGE_PATH) / escaped_document["file_path"].removeprefix("/storage/")
    escaped_path.unlink()
    outside_file = tmp_path / "outside-private-bytes.pdf"
    outside_file.write_bytes(b"%PDF outside storage bytes")
    escaped_path.symlink_to(outside_file)
    escaped_response = await client.get(
        f"/api/v1/documents/{escaped_document['id']}/download",
        headers=student_headers
    )
    assert escaped_response.status_code == 404
    assert escaped_response.content != outside_file.read_bytes()

    other_owner_id = test_student.id + 1000
    other_owner_path = await LocalStorageService().save(
        b"%PDF another owner's bytes",
        "student",
        other_owner_id,
        "owned-by-someone-else.pdf"
    )
    traversing_document = Document(
        owner_type=DocumentOwnerType.STUDENT,
        owner_id=test_student.id,
        journal_id=None,
        file_path=f"/storage/student/{test_student.id}/../../student/{other_owner_id}/owned-by-someone-else.pdf",
        file_name="claimed-owned-document.pdf",
        file_type="application/pdf",
        file_size=26,
        uploaded_by_id=test_admin.id
    )
    db_session.add(traversing_document)
    await db_session.commit()
    traversal_response = await client.get(
        f"/api/v1/documents/{traversing_document.id}/download",
        headers=student_headers
    )
    assert traversal_response.status_code == 404
    await LocalStorageService().delete(other_owner_path)

    deleted_document = await upload_document()
    deleted_path = Path(settings.STORAGE_PATH) / deleted_document["file_path"].removeprefix("/storage/")
    deleted_response = await client.delete(f"/api/v1/documents/{deleted_document['id']}", headers=admin_headers)
    assert deleted_response.status_code == 204
    assert not deleted_path.exists()
    assert (await client.get(
        f"/api/v1/documents/{deleted_document['id']}/download",
        headers=student_headers
    )).status_code == 404


@pytest.mark.asyncio
async def test_public_static_storage_keeps_only_avatar_and_course_media(
    client: AsyncClient,
    test_student: User,
    tmp_path: Path
) -> None:
    storage_service = LocalStorageService()
    avatar_content = b"public avatar test bytes"
    course_content = b"public course image test bytes"
    avatar_path = await storage_service.save(avatar_content, "avatar", test_student.id, "contract-test-avatar.txt")
    course_path = await storage_service.save(course_content, "course", test_student.id, "contract-test-course.txt")
    private_file_path = await storage_service.save(b"private document path bytes", "student", test_student.id, "contract-test-private.txt")
    private_file = Path(settings.STORAGE_PATH) / private_file_path.removeprefix("/storage/")
    avatar_alias = Path(settings.STORAGE_PATH) / "avatar" / str(test_student.id) / "private-document-alias"
    course_alias = Path(settings.STORAGE_PATH) / "course" / str(test_student.id) / "private-document-alias"
    avatar_alias.parent.mkdir(parents=True, exist_ok=True)
    course_alias.parent.mkdir(parents=True, exist_ok=True)
    avatar_alias.symlink_to(private_file)
    course_alias.symlink_to(private_file)

    try:
        avatar_response = await client.get(avatar_path)
        course_response = await client.get(course_path)
        assert avatar_response.status_code == course_response.status_code == 200
        assert avatar_response.content == avatar_content
        assert course_response.content == course_content
        assert avatar_response.headers["cache-control"] == "public, max-age=86400"
        assert (await client.get(f"/storage/avatar/{test_student.id}/{avatar_alias.name}")).status_code == 404
        assert (await client.get(f"/storage/course/{test_student.id}/{course_alias.name}")).status_code == 404

        encoded_private_paths = (
            private_file_path,
            private_file_path.replace("/", "%2F"),
            f"/storage/avatar/%2e%2e/student/{test_student.id}/{Path(private_file_path).name}",
            f"/storage/avatar/%252e%252e/student/{test_student.id}/{Path(private_file_path).name}",
            f"/storage/student/{test_student.id}/%2e%2e/%2e%2e/avatar/{test_student.id}/contract-test-private.txt",
            f"/storage/student/{test_student.id}/%252e%252e/%252e%252e/avatar/{test_student.id}/contract-test-private.txt"
        )
        for private_path in encoded_private_paths:
            private_response = await client.get(private_path)
            assert private_response.status_code == 404
            assert private_response.content != b"private document path bytes"
    finally:
        avatar_alias.unlink(missing_ok=True)
        course_alias.unlink(missing_ok=True)
        await storage_service.delete(avatar_path)
        await storage_service.delete(course_path)
        await storage_service.delete(private_file_path)


@pytest.mark.asyncio
async def test_legacy_document_paths_remain_downloadable(
    client: AsyncClient,
    db_session: AsyncSession,
    test_admin: User,
    test_student: User
) -> None:
    legacy_content = b"%PDF existing legacy attachment bytes"
    legacy_path = await LocalStorageService().save(
        legacy_content,
        "student",
        test_student.id,
        "legacy attachment.pdf"
    )
    legacy_document = Document(
        owner_type=DocumentOwnerType.STUDENT,
        owner_id=test_student.id,
        journal_id=None,
        file_path=legacy_path,
        file_name="legacy attachment.pdf",
        file_type="application/pdf",
        file_size=len(legacy_content),
        uploaded_by_id=test_admin.id
    )
    db_session.add(legacy_document)
    await db_session.commit()
    student_headers = {"Authorization": f"Bearer {create_access_token(test_student.id, test_student.role)}"}

    response = await client.get(
        f"/api/v1/documents/{legacy_document.id}/download",
        headers=student_headers
    )

    assert response.status_code == 200
    assert response.content == legacy_content
    assert response.headers["content-disposition"] == "attachment; filename*=UTF-8''legacy%20attachment.pdf"
