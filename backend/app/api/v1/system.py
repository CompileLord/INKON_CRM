from fastapi import APIRouter, Depends

from app.core.build_info import BuildInfo, get_build_info
from app.core.deps import get_current_user
from app.models.user import User, UserRole
from app.schemas.system import BuildInfoResponse

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/version", response_model=BuildInfoResponse)
async def get_build_version(
    current_user: User = Depends(get_current_user),
    build_info: BuildInfo = Depends(get_build_info),
) -> BuildInfoResponse:
    if current_user.role != UserRole.SUPERADMIN:
        return BuildInfoResponse(version=build_info.version)
    return BuildInfoResponse(
        version=build_info.version,
        commit_sha=build_info.commit_sha,
        commit_message=build_info.commit_message,
        built_at=build_info.built_at,
    )
