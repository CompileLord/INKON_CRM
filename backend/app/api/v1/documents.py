from typing import Optional
from fastapi import APIRouter, Depends, Form, File, UploadFile, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_current_user, require_superadmin
from app.models.user import User
from app.models.document import Document
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
    db: AsyncSession = Depends(get_db_session)
) -> Document:
    if owner_type not in ["student", "mentor"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid owner_type"
        )

    document_service = DocumentService(db)
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
    db: AsyncSession = Depends(get_db_session)
) -> None:
    document_service = DocumentService(db)
    await document_service.delete_document(id)


@router.get("/", response_model=PaginatedResponse[DocumentResponse])
async def list_documents(
    owner_type: Optional[str] = Query(None),
    owner_id: Optional[int] = Query(None),
    journal_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    document_service = DocumentService(db)
    filters = {}
    if owner_type:
        filters["owner_type"] = owner_type
    if owner_id is not None:
        filters["owner_id"] = owner_id
    if journal_id is not None:
        filters["journal_id"] = journal_id
    return await document_service.list_documents(filters, page, page_size, current_user)
