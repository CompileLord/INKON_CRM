from io import BytesIO
from zipfile import ZipFile
import pytest
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User

class DocumentTestContent:
    @staticmethod
    def docx() -> bytes:
        buffer: BytesIO = BytesIO()
        with ZipFile(buffer, "w") as archive:
            archive.writestr("[Content_Types].xml", "<Types/>")
            archive.writestr("word/document.xml", "<document/>")
        return buffer.getvalue()


ACCEPTED_UPLOADS: list[tuple[str, str, bytes | None]] = [
    ("photo.png", "image/png", b"\x89PNG\r\n\x1a\n" + b"0" * 16),
    ("photo.jpg", "image/jpeg", b"\xff\xd8\xff\xe0" + b"0" * 16),
    ("animation.gif", "image/gif", b"GIF89a" + b"0" * 16),
    ("voice.mp3", "audio/mpeg", b"ID3" + b"0" * 16),
    ("voice.wav", "audio/wav", b"RIFF\x00\x00\x00\x00WAVE" + b"0" * 16),
    ("letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", None),
    ("notes.txt", "text/plain", b"plain text notes"),
]

REJECTED_UPLOADS: list[tuple[str, str]] = [
    ("legacy.doc", "application/msword"),
    ("bundle.zip", "application/zip"),
]


async def upload_as_administrator(client: AsyncClient, administrator: User, student: User, file_name: str, content_type: str, content: bytes):
    token: str = create_access_token(administrator.id, administrator.role)
    return await client.post(
        "/api/v1/documents/",
        data={"owner_type": "student", "owner_id": student.id},
        files={"file": (file_name, content, content_type)},
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("file_name,content_type,content", ACCEPTED_UPLOADS)
async def test_every_picker_family_is_accepted(client: AsyncClient, test_admin: User, test_student: User, file_name: str, content_type: str, content: bytes | None) -> None:
    response = await upload_as_administrator(client, test_admin, test_student, file_name, content_type, content if content is not None else DocumentTestContent.docx())
    assert response.status_code == 201
    assert response.json()["file_type"] == content_type


@pytest.mark.asyncio
@pytest.mark.parametrize("file_name,content_type", REJECTED_UPLOADS)
async def test_doc_and_zip_are_rejected_as_unsupported(client: AsyncClient, test_admin: User, test_student: User, file_name: str, content_type: str) -> None:
    response = await upload_as_administrator(client, test_admin, test_student, file_name, content_type, b"PK\x03\x04" + b"0" * 16)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported file format"


@pytest.mark.asyncio
async def test_spoofed_contents_are_reported_distinctly_from_unsupported_type(client: AsyncClient, test_admin: User, test_student: User) -> None:
    response = await upload_as_administrator(client, test_admin, test_student, "spoofed.png", "image/png", b"not a png")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid file contents for specified file type"


@pytest.mark.asyncio
async def test_exactly_fifty_mebibytes_is_accepted_and_one_byte_more_is_rejected(client: AsyncClient, test_admin: User, test_student: User) -> None:
    limit: int = 50 * 1024 * 1024
    accepted = await upload_as_administrator(client, test_admin, test_student, "limit.pdf", "application/pdf", b"%PDF" + b"0" * (limit - 4))
    assert accepted.status_code == 201
    assert accepted.json()["file_size"] == limit
    rejected = await upload_as_administrator(client, test_admin, test_student, "over.pdf", "application/pdf", b"%PDF" + b"0" * (limit - 3))
    assert rejected.status_code == 413
