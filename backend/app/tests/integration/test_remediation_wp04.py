from pathlib import Path

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token
from app.models.document import Document
from app.models.user import User, UserRole


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
