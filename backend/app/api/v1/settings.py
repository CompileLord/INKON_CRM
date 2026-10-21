from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db_session, require_superadmin
from app.models.user import User
from app.schemas.org_settings import OrgSettingsResponse, OrgSettingsUpdate
from app.schemas.telegram_status import TelegramBotCheckResponse
from app.services.telegram_status_service import TelegramStatusService
from app.telegram_bot.bot import bot
from app.services.settings_service import SettingsService

from app.api.v1.contract_notes import ContractNotes

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/org", response_model=OrgSettingsResponse)
async def get_org_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> OrgSettingsResponse:
    settings_service = SettingsService(db)
    return await settings_service.get_org_settings()


@router.patch("/org", response_model=OrgSettingsResponse, description=ContractNotes.ORG_SETTINGS_UPDATE)
async def update_org_settings(
    data: OrgSettingsUpdate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> OrgSettingsResponse:
    settings_service = SettingsService(db)
    return await settings_service.update_org_settings(data)


def get_telegram_status_service() -> TelegramStatusService:
    return TelegramStatusService(bot)


@router.post("/telegram/test", response_model=TelegramBotCheckResponse)
async def test_telegram_bot(
    current_user: User = Depends(require_superadmin),
    service: TelegramStatusService = Depends(get_telegram_status_service),
) -> dict:
    return await service.check_bot()
