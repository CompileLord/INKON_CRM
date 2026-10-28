from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from app.core.deps import get_current_user, get_notification_service, get_notification_retry_service, require_superadmin
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.models.notification_log import NotificationLog, NotificationStatus
from app.schemas.notification import DeliveryLogResponse, MarkAllReadResponse, NotificationResponse, UnreadCountResponse
from app.services.notification_service import NotificationService
from app.services.notification_retry_service import NotificationRetryService
from app.core.rate_limiter import AtomicRateLimiter
from app.core.config import settings

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[NotificationResponse])
async def list_notifications(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
) -> dict:
    return await service.get_user_notifications(current_user.id, page, page_size)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
) -> dict:
    count: int = await service.get_unread_count(current_user.id)
    return {"unread_count": count}


@router.post("/read-all", response_model=MarkAllReadResponse)
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
) -> dict:
    updated_count: int = await service.mark_all_as_read(current_user.id)
    return {"updated_count": updated_count}


@router.get("/delivery-log", response_model=PaginatedResponse[DeliveryLogResponse])
async def list_delivery_log(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    delivery_status: Optional[NotificationStatus] = Query(default=None, alias="status"),
    current_user: User = Depends(require_superadmin),
    service: NotificationService = Depends(get_notification_service)
) -> dict:
    return await service.get_delivery_log(page, page_size, delivery_status)


@router.post("/logs/{id}/retry", response_model=DeliveryLogResponse)
async def retry_delivery_log(
    id: int,
    current_user: User = Depends(require_superadmin),
    service: NotificationRetryService = Depends(get_notification_retry_service),
) -> dict:
    await AtomicRateLimiter().acquire(
        f"notification:retry:actor:{current_user.id}", settings.SMS_PASSWORD_IP_LIMIT,
        settings.SMS_PASSWORD_IP_WINDOW_SECONDS,
    )
    return await service.retry(id, current_user.id)


@router.patch("/{id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    id: int,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service)
) -> NotificationLog:
    return await service.mark_as_read(id, current_user.id)
