from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol

from fastapi import HTTPException, status

from app.models.document import Document, DocumentOwnerType
from app.models.user import User, UserRole
from app.repositories.interfaces.document_repository import DocumentRepository


class DocumentFileReader(Protocol):
    def resolve_document_path(self, file_path: str, owner_type: str, owner_id: int) -> Path:
        ...


@dataclass(frozen=True)
class DocumentDownload:
    path: Path
    filename: str
    media_type: str


class DocumentDeliveryService:
    def __init__(self, repository: DocumentRepository, file_reader: DocumentFileReader) -> None:
        self.repository = repository
        self.file_reader = file_reader

    async def prepare_download(self, document_id: int, current_user: User) -> DocumentDownload:
        if current_user.role not in (UserRole.SUPERADMIN, UserRole.MENTOR, UserRole.STUDENT):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not enough permissions")
        document: Document | None = await self.repository.get_by_id(document_id)
        if document is None or document.is_deleted:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        permitted: bool = current_user.role == UserRole.SUPERADMIN
        if current_user.role == UserRole.STUDENT:
            permitted = document.owner_type == DocumentOwnerType.STUDENT and document.owner_id == current_user.id
        elif current_user.role == UserRole.MENTOR:
            permitted = document.owner_type == DocumentOwnerType.STUDENT or (
                document.owner_type == DocumentOwnerType.MENTOR and document.owner_id == current_user.id
            )
        if not permitted:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not enough permissions")
        try:
            path: Path = self.file_reader.resolve_document_path(
                document.file_path, DocumentOwnerType(document.owner_type).value, document.owner_id
            )
        except (ValueError, OSError):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document file not found")
        basename: str = PurePosixPath(document.file_name.replace("\\", "/")).name
        filename: str = "".join(character for character in basename if ord(character) >= 32 and ord(character) != 127)
        if filename in ("", ".", ".."):
            filename = "document"
        return DocumentDownload(path=path, filename=filename, media_type="application/octet-stream")
