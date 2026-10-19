from fastapi import APIRouter, Depends, status, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_db_session, get_storage_service, require_superadmin, get_current_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserCreateResponse, UserUpdate, UserSelfUpdate, UserResponse
from app.services.telegram_link_service import IssuedLinkCode
from app.services.storage_service import StorageService
from app.services.user_service import UserService

router = APIRouter()


@router.post("/", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> UserCreateResponse:
    user_service = UserService(db)
    created_user: User
    issued_link_code: IssuedLinkCode | None
    created_user, issued_link_code = await user_service.create_user_with_link_code(payload)
    response: UserCreateResponse = UserCreateResponse.model_validate(created_user, from_attributes=True)
    response.parent_link_code = issued_link_code.code if issued_link_code else None
    return response


@router.get("/me", response_model=UserResponse)
async def get_own_profile(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_own_profile(
    payload: UserSelfUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    user_service = UserService(db)
    return await user_service.update_own_profile(current_user.id, payload)


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
    db: AsyncSession = Depends(get_db_session),
    storage: StorageService = Depends(get_storage_service),
) -> User:
    if current_user.role != UserRole.SUPERADMIN and current_user.id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    user_service = UserService(db, storage)
    return await user_service.upload_avatar(id, file)
