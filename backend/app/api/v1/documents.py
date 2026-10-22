from typing import Optional
from pathlib import PurePosixPath
from urllib.parse import quote
from fastapi import APIRouter, Depends, Form, File, UploadFile, Query, HTTPException, Response, status
from app.core.deps import get_document_service, get_current_user, require_superadmin
from app.models.user import User, UserRole
from app.models.document import Document
from app.repositories.interfaces.document_repository import DocumentFilters
from app.schemas.document import DocumentResponse
from app.schemas.common import PaginatedResponse
from app.services.document_service import DocumentService

router = APIRouter()


@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: int = Form(...),
    journal_id: Optional[int] = Form(None),
    current_user: User = Depends(require_superadmin),
    document_service: DocumentService = Depends(get_document_service),
) -> Document:
    if owner_type not in ["student", "mentor"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid owner_type"
        )

    return await document_service.upload_document(
        file=file,
        owner_type=owner_type,
        owner_id=owner_id,
        journal_id=journal_id,
        current_user=current_user
    )


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    id: int,
    current_user: User = Depends(require_superadmin),
    document_service: DocumentService = Depends(get_document_service),
) -> None:
    await document_service.delete_document(id)


@router.get("/", response_model=PaginatedResponse[DocumentResponse])
async def list_documents(
    owner_type: Optional[str] = Query(None),
    owner_id: Optional[int] = Query(None),
    journal_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    document_service: DocumentService = Depends(get_document_service),
) -> dict:
    filters: DocumentFilters = {}
    if owner_type:
        filters["owner_type"] = owner_type
    if owner_id is not None:
        filters["owner_id"] = owner_id
    if journal_id is not None:
        filters["journal_id"] = journal_id
    return await document_service.list_documents(filters, page, page_size, current_user)


@router.get("/{document_id}/download", response_class=Response, responses={
    200: {"content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}
})
async def download_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    document_service: DocumentService = Depends(get_document_service),
) -> Response:
    document, file_content = await document_service.read_document(document_id, current_user)
    basename = PurePosixPath(document.file_name.replace("\\", "/")).name
    safe_filename = "".join(character for character in basename if ord(character) >= 32 and ord(character) != 127)
    filename = quote(safe_filename if safe_filename not in ("", ".", "..") else "document", safe="")
    return Response(
        content=file_content,
        media_type="application/octet-stream",
        headers={
            "Cache-Control": "no-store, max-age=0, must-revalidate",
            "Content-Disposition": f"attachment; filename*=utf-8''{filename}",
            "X-Content-Type-Options": "nosniff",
        },
    )
