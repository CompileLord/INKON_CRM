import os
from typing import List, Optional
from fastapi import HTTPException, status, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.document import Document, DocumentOwnerType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.document_repository import SQLAlchemyDocumentRepository
from app.services.storage_service import LocalStorageService


def verify_magic_bytes(content: bytes, filename: str) -> bool:
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        return content.startswith(b"%PDF")
    elif ext in ["jpeg", "jpg"]:
        return content.startswith(b"\xff\xd8")
    elif ext == "png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext == "gif":
        return content.startswith(b"GIF8")
    elif ext == "docx":
        return content.startswith(b"PK\x03\x04")
    elif ext == "txt":
        return b"\x00" not in content
    elif ext == "mp3":
        return content.startswith(b"ID3") or content.startswith(b"\xff\xfb") or content.startswith(b"\xff\xf3") or content.startswith(b"\xff\xf2")
    elif ext == "wav":
        return content.startswith(b"RIFF") and b"WAVE" in content[:12]
    return True


class DocumentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.document_repo = SQLAlchemyDocumentRepository(db)
        self.storage_service = LocalStorageService()

    async def upload_document(
        self,
        file: UploadFile,
        owner_type: str,
        owner_id: int,
        journal_id: Optional[int],
        current_user: User
    ) -> Document:
        content = await file.read()
        file_size = len(content)
        if file_size > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds the 50MB limit"
            )

        content_type = file.content_type or ""
        allowed_types = ["audio", "image", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]
        is_allowed = False
        for t in allowed_types:
            if content_type.startswith(t):
                is_allowed = True
                break
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file format"
            )

        if not verify_magic_bytes(content, file.filename):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file contents for specified file type"
            )

        filepath = await self.storage_service.save(content, owner_type, owner_id, file.filename)

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
            summary_query = select(JournalStudentSummary).filter(
                JournalStudentSummary.journal_id == journal_id,
                JournalStudentSummary.student_id == owner_id
            )
            summary_res = await self.db.execute(summary_query)
            summary = summary_res.scalars().first()
            if summary and summary.exam_score > 0:
                from arq import create_pool
                from arq.connections import RedisSettings
                from app.core.config import settings
                if not settings.TESTING:
                    try:
                        redis_settings = RedisSettings(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
                        pool = await create_pool(redis_settings)
                        await pool.enqueue_job("send_student_document_notification_task", owner_id, journal_id)
                    except Exception:
                        pass

        await self.db.refresh(document)
        return document

    async def delete_document(self, document_id: int) -> bool:
        doc = await self.document_repo.get_by_id(document_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )

        await self.storage_service.delete(doc.file_path)
        success = await self.document_repo.soft_delete(document_id)
        return success

    async def list_documents(
        self,
        filters: dict,
        page: int,
        page_size: int,
        current_user: User
    ) -> dict:
        query = select(Document).filter(Document.is_deleted == False)

        if current_user.role == UserRole.STUDENT:
            query = query.filter(
                Document.owner_type == DocumentOwnerType.STUDENT,
                Document.owner_id == current_user.id
            )
        elif current_user.role == UserRole.MENTOR:
            from sqlalchemy import or_
            query = query.filter(
                or_(
                    Document.owner_type == DocumentOwnerType.STUDENT,
                    (Document.owner_type == DocumentOwnerType.MENTOR) & (Document.owner_id == current_user.id)
                )
            )
        elif current_user.role == UserRole.SUPERADMIN:
            pass
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )

        owner_type = filters.get("owner_type")
        if owner_type:
            query = query.filter(Document.owner_type == owner_type)

        owner_id = filters.get("owner_id")
        if owner_id:
            query = query.filter(Document.owner_id == owner_id)

        journal_id = filters.get("journal_id")
        if journal_id:
            query = query.filter(Document.journal_id == journal_id)

        query = query.order_by(Document.id.desc())
        return await self.document_repo.get_paginated(query, page, page_size)
