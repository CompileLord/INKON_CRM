from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, require_superadmin
from app.models.user import User
from app.repositories.sqlalchemy.dashboard_attention_repository import DashboardAttentionRepository
from app.schemas.dashboard_attention import DashboardAttentionResponse
from app.services.dashboard_attention_service import DashboardAttentionService, SchoolClock

router: APIRouter = APIRouter()


def get_attention_service(db: AsyncSession = Depends(get_db_session)) -> DashboardAttentionService:
    return DashboardAttentionService(DashboardAttentionRepository(db), SchoolClock())


@router.get('/attention', response_model=DashboardAttentionResponse)
async def attention(current_user: User = Depends(require_superadmin),
    service: DashboardAttentionService = Depends(get_attention_service)) -> DashboardAttentionResponse:
    return await service.get_attention()
