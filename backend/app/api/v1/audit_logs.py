from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, require_superadmin
from app.models.audit_log import AuditAction
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.audit_log import AuditEventResponse, AuditFilterOptionsResponse, AuditLogResponse
from app.services.audit_service import AuditService

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor_id: Optional[int] = Query(None, ge=1),
    action: Optional[AuditAction] = Query(None),
    entity_type: Optional[str] = Query(None, min_length=1, max_length=100),
    entity_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[date] = Query(None, description="Inclusive Dushanbe calendar day"),
    date_to: Optional[date] = Query(None, description="Inclusive Dushanbe calendar day"),
    search: Optional[str] = Query(None, max_length=100, description="Matches actor name, entity type or field name"),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    audit_service = AuditService(db)
    return await audit_service.list_logs(
        page,
        page_size,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/events/", response_model=PaginatedResponse[AuditEventResponse])
async def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    actor_id: Optional[int] = Query(None, ge=1),
    action: Optional[AuditAction] = Query(None),
    entity_type: Optional[str] = Query(None, min_length=1, max_length=100),
    entity_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[date] = Query(None, description="Inclusive Dushanbe calendar day"),
    date_to: Optional[date] = Query(None, description="Inclusive Dushanbe calendar day"),
    search: Optional[str] = Query(None, max_length=100, description="Matches actor name, entity type or field name"),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    audit_service = AuditService(db)
    return await audit_service.list_events(
        page,
        page_size,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/filter-options/", response_model=AuditFilterOptionsResponse)
async def get_audit_filter_options(
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> dict:
    audit_service = AuditService(db)
    return await audit_service.get_filter_options()
