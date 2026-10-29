from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType
from app.models.outbox_event import OutboxEvent, OutboxEventKind, OutboxEventStatus
from app.models.user import User


@pytest.mark.asyncio
async def test_debt_sms_delivery_log_pagination_status_and_retry(client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User) -> None:
    now: datetime = datetime.now(timezone.utc)
    events: list[OutboxEvent] = [
        OutboxEvent(kind=OutboxEventKind.DEBT_REMINDER_SMS, status=OutboxEventStatus.DELIVERED, recipient_email="", subject="", target_user_id=test_student.id, created_at=now, delivered_at=now, dispatched_amount=Decimal("321.50"), attempt_count=1),
        OutboxEvent(kind=OutboxEventKind.DEBT_REMINDER_SMS, status=OutboxEventStatus.EXPIRED, recipient_email="", subject="", target_user_id=test_student.id, created_at=now, last_error="no_current_debt", attempt_count=1),
        OutboxEvent(kind=OutboxEventKind.DEBT_REMINDER_SMS, status=OutboxEventStatus.FAILED, recipient_email="", subject="", target_user_id=test_student.id, created_at=now, last_error="provider_error", attempt_count=2),
    ]
    db_session.add_all(events)
    db_session.add(NotificationLog(recipient="test", type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2000, 1, 1), status=NotificationStatus.SENT))
    db_session.add(OutboxEvent(kind=OutboxEventKind.STUDENT_PASSWORD_SMS, status=OutboxEventStatus.FAILED, recipient_email="", subject="", target_user_id=test_student.id, created_at=now))
    await db_session.commit()
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    first = await client.get("/api/v1/notifications/delivery-log?page=1&page_size=1", headers=headers)
    second = await client.get("/api/v1/notifications/delivery-log?page=2&page_size=1", headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()["total"] == second.json()["total"] == 4
    third = await client.get("/api/v1/notifications/delivery-log?page=3&page_size=1", headers=headers)
    items: list[dict] = [first.json()["items"][0], second.json()["items"][0], third.json()["items"][0]]
    sent: dict = next(item for item in items if item["status"] == "sent")
    failed: dict = next(item for item in items if item["outbox_status"] == "expired")
    provider_failure: dict = next(item for item in items if item["outbox_status"] == "failed")
    assert provider_failure["reason"] == "provider_error"
    assert (sent["amount"], sent["student_id"], sent["course_id"]) == ("321.50", test_student.id, None)
    assert failed["reason"] == "no_current_debt" and failed["outbox_status"] == "expired"
    fourth = await client.get("/api/v1/notifications/delivery-log?page=4&page_size=1", headers=headers)
    assert fourth.json()["items"][0]["type"] == "exam_result"
    filtered = await client.get("/api/v1/notifications/delivery-log?status=failed", headers=headers)
    assert filtered.json()["total"] == 2
    retry = await client.post(f"/api/v1/notifications/logs/{failed['id']}/retry", headers=headers)
    assert retry.status_code == 409 and retry.json()["detail"]["code"] == "debt_reminder_sms_retry_unavailable"
    failed_retry = await client.post(f"/api/v1/notifications/logs/{provider_failure['id']}/retry", headers=headers)
    assert failed_retry.status_code == 409 and failed_retry.json()["detail"]["code"] == "debt_reminder_sms_retry_unavailable"
    missing_retry = await client.post("/api/v1/notifications/logs/-999999/retry", headers=headers)
    assert missing_retry.status_code == 404 and missing_retry.json()["detail"]["code"] == "notification_not_found"
