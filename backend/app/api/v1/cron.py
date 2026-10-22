import secrets
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from redis.exceptions import RedisError

from app.core.config import settings
from app.schemas.maintenance import MaintenanceAccepted
from app.workers.settings import MaintenanceScheduler
from app.workers.tasks import archive_expired_courses, check_payment_reminders


def verify_cron_secret(x_cloud_scheduler_secret: Optional[str] = Header(None)) -> None:
    configured_secret: Optional[str] = settings.CRON_SECRET
    if not configured_secret or x_cloud_scheduler_secret is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing scheduler authorization token"
        )
    if not secrets.compare_digest(
        x_cloud_scheduler_secret.encode("utf-8"),
        configured_secret.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing scheduler authorization token"
        )


router: APIRouter = APIRouter(dependencies=[Depends(verify_cron_secret)])


@router.post(
    "/archive-courses",
    response_model=MaintenanceAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    responses={503: {"description": "Maintenance queue unavailable; retry after 60 seconds"}},
)
async def trigger_archive_courses(scheduler: MaintenanceScheduler = Depends()) -> MaintenanceAccepted:
    try:
        job_id: str = await scheduler.enqueue(archive_expired_courses.__name__)
    except (RedisError, OSError, TimeoutError) as error:
        raise HTTPException(
            status_code=503,
            detail="Maintenance queue unavailable",
            headers={"Retry-After": "60"},
        ) from error
    return MaintenanceAccepted(task="archive_expired_courses", job_id=job_id)


@router.post(
    "/payment-reminders",
    response_model=MaintenanceAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    responses={503: {"description": "Maintenance queue unavailable; retry after 60 seconds"}},
)
async def trigger_payment_reminders(scheduler: MaintenanceScheduler = Depends()) -> MaintenanceAccepted:
    try:
        job_id: str = await scheduler.enqueue(check_payment_reminders.__name__)
    except (RedisError, OSError, TimeoutError) as error:
        raise HTTPException(
            status_code=503,
            detail="Maintenance queue unavailable",
            headers={"Retry-After": "60"},
        ) from error
    return MaintenanceAccepted(task="check_payment_reminders", job_id=job_id)
