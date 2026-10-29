from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import HTTPException
from app.models.course import CourseStatus
from app.models.user import User, UserRole
from app.schemas.course import MentorMiniResponse
from app.services.audit_service import AuditService
from app.services.document_service import verify_magic_bytes
from app.services.journal_service import JournalService
from app.repositories.interfaces.journal_cell_lookup import JournalCellLookup


def test_document_unknown_extension_is_rejected() -> None:
    assert not verify_magic_bytes(b"anything", "file.exe")
    assert verify_magic_bytes(b"%PDF-1.7", "file.pdf")
    assert not verify_magic_bytes(b"%PDF-1.7", "pdf")
    assert not verify_magic_bytes(b"PK\x03\x04invalid", "file.docx")
    assert not verify_magic_bytes(b"\xffbinary", "file.txt")

@pytest.mark.asyncio
async def test_document_rejects_mismatched_mime_and_deleted_owner() -> None:
    from io import BytesIO
    from starlette.datastructures import Headers, UploadFile
    from app.services.document_service import DocumentService

    database: MagicMock = MagicMock()
    service: DocumentService = DocumentService(database, storage=MagicMock(), document_repo=MagicMock())
    user: User = User(id=1, role=UserRole.SUPERADMIN)
    mismatch: UploadFile = UploadFile(BytesIO(b"%PDF-1.7"), filename="a.pdf", headers=Headers({"content-type": "image/png"}))
    with pytest.raises(HTTPException) as error:
        await service.upload_document(mismatch, "student", 7, None, user)
    assert error.value.status_code == 400
    database.get = AsyncMock(return_value=User(id=7, role=UserRole.STUDENT, is_deleted=True))
    valid: UploadFile = UploadFile(BytesIO(b"%PDF-1.7"), filename="a.pdf", headers=Headers({"content-type": "application/pdf"}))
    with pytest.raises(HTTPException) as error:
        await service.upload_document(valid, "student", 7, None, user)
    assert error.value.status_code == 404
