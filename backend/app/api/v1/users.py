from fastapi import APIRouter, Depends, Query, status, File, UploadFile, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limiter import get_client_ip
from app.core.sms_rate_limiter import PasswordSmsRateLimiter
from app.core.deps import get_db_session, get_storage_service, require_superadmin, get_current_user
from app.models.user import User, UserRole
from app.models.outbox_event import OutboxEvent, OutboxEventStatus
from app.services.student_password_sms_service import PasswordSmsDestination
from app.schemas.user import PasswordSmsDeliveryResponse, PasswordSmsResendResponse, UserCreate, UserCreateResponse, UserUpdate, UserSelfUpdate, UserResponse
from app.services.telegram_link_service import IssuedLinkCode
from app.services.storage_service import StorageService
from app.services.user_service import UserService

from app.api.v1.contract_notes import ContractNotes

router = APIRouter()


@router.post("/", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED, description=ContractNotes.USER_CREATE)
async def create_user(
    payload: UserCreate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> UserCreateResponse:
    if payload.role == UserRole.STUDENT:
        await PasswordSmsRateLimiter().consume_ip_budget(get_client_ip(request))
    user_service: UserService = UserService(db)
    created_user: User
    issued_link_code: IssuedLinkCode | None
    destination: PasswordSmsDestination | None
    created_user, issued_link_code, destination = await user_service.create_user_with_link_code(
        payload, current_user.id
    )
    response: UserCreateResponse = UserCreateResponse.model_validate(created_user, from_attributes=True)
    response.parent_link_code = issued_link_code.code if issued_link_code else None
    response.password_sms_destination = destination.kind.value if destination else None
    return response


@router.get("/password-sms-deliveries", response_model=list[PasswordSmsDeliveryResponse])
async def list_password_sms_deliveries(
    user_id: int | None = None,
    delivery_status: list[OutboxEventStatus] = Query(
        default=[OutboxEventStatus.FAILED, OutboxEventStatus.EXPIRED], alias="status"
    ),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> list[PasswordSmsDeliveryResponse]:
    events: list[OutboxEvent] = await UserService(db).list_password_sms_deliveries(
        delivery_status, user_id, limit
    )
    return [PasswordSmsDeliveryResponse.from_event(event) for event in events]


@router.post("/{id}/resend-password-sms", response_model=PasswordSmsResendResponse)
async def resend_password_sms(
    id: int,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> PasswordSmsResendResponse:
    await PasswordSmsRateLimiter().consume_ip_budget(get_client_ip(request))
    destination: PasswordSmsDestination = await UserService(db).resend_password_sms(id, current_user.id)
    return PasswordSmsResendResponse(destination=destination.kind.value)


@router.get("/me", response_model=UserResponse)
async def get_own_profile(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.patch("/me", response_model=UserResponse, description=ContractNotes.USER_SELF_UPDATE)
async def update_own_profile(
    payload: UserSelfUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    user_service = UserService(db)
    return await user_service.update_own_profile(current_user.id, payload)


@router.patch("/{id}", response_model=UserResponse, description=ContractNotes.USER_UPDATE)
async def update_user(
    id: int,
    payload: UserUpdate,
    request: Request,
    current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    user_service = UserService(db)
    if payload.email:
        await PasswordSmsRateLimiter().consume_ip_budget(get_client_ip(request))
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
