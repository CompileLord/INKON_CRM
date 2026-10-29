from typing import Optional
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from fastapi import HTTPException, status, UploadFile
from app.core.config import settings
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document, DocumentOwnerType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.models.outbox_event import OutboxEventKind
from app.repositories.interfaces.base_repository import RepositoryPage
from app.repositories.interfaces.document_repository import DocumentRepository, DocumentFilters
from app.repositories.sqlalchemy.document_repository import SQLAlchemyDocumentRepository
from app.repositories.sqlalchemy.outbox_repository import SQLAlchemyOutboxRepository
from app.services.outbox_service import OutboxService
from app.services.storage_lifecycle_service import StorageLifecycleService
from app.services.storage_service import StorageService, get_storage_service
from app.services.bounded_upload_reader import BoundedUploadReader




class DocumentService:
    @staticmethod
    def verify_magic_bytes(content: bytes, filename: str) -> bool:
        if "." not in filename:
            return False
        ext: str = filename.rsplit(".", 1)[-1].lower()
        if ext == "pdf":
            return content.startswith(b"%PDF")
        elif ext in ["jpeg", "jpg"]:
            return content.startswith(b"\xff\xd8")
        elif ext == "png":
            return content.startswith(b"\x89PNG\r\n\x1a\n")
        elif ext == "gif":
            return content.startswith(b"GIF8")
        elif ext == "docx":
            try:
                with ZipFile(BytesIO(content)) as archive:
                    names: set[str] = set(archive.namelist())
                    return "[Content_Types].xml" in names and "word/document.xml" in names
            except BadZipFile:
                return False
        elif ext == "txt":
            try:
                content.decode("utf-8")
                return b"\x00" not in content
            except UnicodeDecodeError:
                return False
        elif ext == "mp3":
            return content.startswith(b"ID3") or content.startswith(b"\xff\xfb") or content.startswith(b"\xff\xf3") or content.startswith(b"\xff\xf2")
        elif ext == "wav":
            return content.startswith(b"RIFF") and b"WAVE" in content[:12]
        return False


    def __init__(self, db: AsyncSession, storage: StorageService | None = None, document_repo: DocumentRepository | None = None) -> None:
        self.db: AsyncSession = db
        self.document_repo: DocumentRepository = document_repo if document_repo is not None else SQLAlchemyDocumentRepository(db)
        self.storage_service: StorageService = storage or get_storage_service()
        self.upload_storage_service: StorageService = self.storage_service

    async def upload_document(
        self,
        file: UploadFile,
        owner_type: str,
        owner_id: int,
        journal_id: Optional[int],
        current_user: User
    ) -> Document:
        content: bytes = await BoundedUploadReader().read(
            file, 50 * 1024 * 1024, "File size exceeds the 50MB limit"
        )
        file_size: int = len(content)

        content_type: str = file.content_type or ""
        extension: str = (file.filename or "").rsplit(".", 1)[-1].lower()
        allowed_types: dict[str, set[str]] = {
            "pdf": {"application/pdf"}, "jpg": {"image/jpeg"}, "jpeg": {"image/jpeg"},
            "png": {"image/png"}, "gif": {"image/gif"},
            "docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
            "txt": {"text/plain"}, "mp3": {"audio/mpeg"}, "wav": {"audio/wav", "audio/x-wav"},
        }
        if content_type not in allowed_types.get(extension, set()):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file format")

        if not self.verify_magic_bytes(content, file.filename or ""):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file contents for specified file type"
            )

        if owner_type not in ("student", "mentor") or owner_id <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid document storage path")
        owner: User | None = await self.db.get(User, owner_id)
        expected_role: UserRole = UserRole.STUDENT if owner_type == "student" else UserRole.MENTOR
        if owner is None or owner.is_deleted or owner.role != expected_role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document owner not found")
        try:
            lifecycle: StorageLifecycleService = StorageLifecycleService(self.db, self.upload_storage_service)
            filepath: str
            intent_id: str
            filepath, intent_id = await lifecycle.stage(content, owner_type, owner_id, file.filename)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid document storage path")

        document = Document(
            owner_type=DocumentOwnerType(owner_type),
            owner_id=owner_id,
            journal_id=journal_id if owner_type == "student" else None,
            file_path=filepath,
            file_name=file.filename,
            file_type=content_type,
            file_size=file_size,
            uploaded_by_id=current_user.id
        )
        self.db.add(document)
        await self.db.flush()

        if owner_type == "student" and journal_id is not None:
            summary: JournalStudentSummary | None = await self.document_repo.get_journal_summary(journal_id, owner_id)
            if summary and summary.exam_score > 0:
                outbox_service: OutboxService = OutboxService(
                    SQLAlchemyOutboxRepository(self.db), settings.JWT_SECRET_KEY
                )
                await outbox_service.enqueue_notification(
                    OutboxEventKind.DOCUMENT_NOTIFICATION,
                    owner_id,
                    journal_id,
                    f"document:{document.id}",
                )

        await lifecycle.adopt(intent_id)
        await self.db.refresh(document)
        return document

    async def delete_document(self, document_id: int) -> bool:
        doc = await self.document_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )

        lifecycle: StorageLifecycleService = StorageLifecycleService(self.db, self.storage_service)
        success = await self.document_repo.soft_delete(document_id)
        await lifecycle.delete_after_commit(doc.file_path)
        return success

    async def list_documents(
        self,
        filters: DocumentFilters,
        page: int,
        page_size: int,
        current_user: User
    ) -> RepositoryPage[Document]:
        requested_owner_id: int | None = filters.get("owner_id")
        if (
            current_user.role == UserRole.MENTOR
            and filters.get("owner_type") == DocumentOwnerType.STUDENT
            and requested_owner_id is not None
            and not await self.document_repo.mentor_has_student(current_user.id, requested_owner_id)
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        self._validate_viewer(current_user)
        return await self.document_repo.list_documents(filters, current_user.id, current_user.role, page, page_size)

    async def read_document(self, document_id: int, current_user: User) -> tuple[Document, bytes]:
        self._validate_viewer(current_user)
        document: Document | None = await self.document_repo.get_visible_document(document_id, current_user.id, current_user.role)
        if document is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        try:
            if document.file_path.startswith(("/storage/", "storage/")):
                self._assert_key_belongs_to_owner(document)
            file_content: bytes = await self.storage_service.read(document.file_path)
        except PermissionError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Private document storage is unavailable",
            )
        except (FileNotFoundError, ValueError):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        return document, file_content

    def _assert_key_belongs_to_owner(self, document: Document) -> None:
        owner_segment: str
        owner_identifier: str
        object_name: str
        owner_segment, owner_identifier, object_name = self.storage_service.canonical_key(document.file_path).split("/")
        if owner_segment != DocumentOwnerType(document.owner_type).value or owner_identifier != str(document.owner_id):
            raise ValueError("Invalid document path")

    @staticmethod
    def _validate_viewer(current_user: User) -> None:
        if current_user.role not in (UserRole.STUDENT, UserRole.MENTOR, UserRole.SUPERADMIN):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
