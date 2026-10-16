import secrets
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from app.core.config import settings
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


router = APIRouter(dependencies=[Depends(verify_cron_secret)])


@router.post("/archive-courses", status_code=status.HTTP_200_OK)
async def trigger_archive_courses() -> dict:
    await archive_expired_courses({})
    return {"status": "success", "task": "archive_expired_courses"}


@router.post("/payment-reminders", status_code=status.HTTP_200_OK)
async def trigger_payment_reminders() -> dict:
    await check_payment_reminders({})
    return {"status": "success", "task": "check_payment_reminders"}
