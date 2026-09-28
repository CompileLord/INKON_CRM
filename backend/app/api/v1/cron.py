from typing import Optional
from fastapi import APIRouter, Header, HTTPException, status
from app.core.config import settings
from app.workers.tasks import archive_expired_courses, check_payment_reminders

router = APIRouter()


def verify_cron_secret(x_cloud_scheduler_secret: Optional[str] = Header(None)) -> None:
    if settings.CRON_SECRET and x_cloud_scheduler_secret != settings.CRON_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing scheduler authorization token"
        )


@router.post("/archive-courses", status_code=status.HTTP_200_OK)
async def trigger_archive_courses(
    x_cloud_scheduler_secret: Optional[str] = Header(None)
) -> dict:
    verify_cron_secret(x_cloud_scheduler_secret)
    await archive_expired_courses({})
    return {"status": "success", "task": "archive_expired_courses"}


@router.post("/payment-reminders", status_code=status.HTTP_200_OK)
async def trigger_payment_reminders(
    x_cloud_scheduler_secret: Optional[str] = Header(None)
) -> dict:
    verify_cron_secret(x_cloud_scheduler_secret)
    await check_payment_reminders({})
    return {"status": "success", "task": "check_payment_reminders"}
