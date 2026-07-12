from fastapi import APIRouter, Depends, status, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, require_superadmin, get_current_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.user_service import UserService

router = APIRouter()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    user_service = UserService(db)
    return await user_service.create_user(payload)


@router.patch("/{id}", response_model=UserResponse)
async def update_user(
    id: int,
    payload: UserUpdate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    user_service = UserService(db)
    return await user_service.update_user(id, payload)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    id: int,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> None:
    user_service = UserService(db)
    await user_service.delete_user(id, current_user.id)


@router.post("/{id}/avatar/", response_model=UserResponse)
async def upload_avatar(
    id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    if current_user.role != UserRole.SUPERADMIN and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    user_service = UserService(db)
    return await user_service.upload_avatar(id, file)
