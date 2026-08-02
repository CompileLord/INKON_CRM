from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_session, require_superadmin
from app.models.user import User
from app.schemas.org_settings import OrgSettingsResponse, OrgSettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/org", response_model=OrgSettingsResponse)
async def get_org_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> OrgSettingsResponse:
    settings_service = SettingsService(db)
    return await settings_service.get_org_settings()


@router.patch("/org", response_model=OrgSettingsResponse)
async def update_org_settings(
    data: OrgSettingsUpdate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> OrgSettingsResponse:
    settings_service = SettingsService(db)
    return await settings_service.update_org_settings(data)
