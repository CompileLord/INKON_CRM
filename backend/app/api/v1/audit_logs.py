from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, require_superadmin
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.audit_log import AuditLogResponse
from app.services.audit_service import AuditService

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    audit_service = AuditService(db)
    return await audit_service.list_logs(page, page_size)
