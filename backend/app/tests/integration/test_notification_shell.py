from datetime import date
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User
from app.models.notification_log import NotificationLog, NotificationStatus, NotificationType


@pytest.mark.asyncio
async def test_personal_inbox_and_read_commands_enforce_ownership(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    own: NotificationLog = NotificationLog(user_id=test_student.id, recipient="student-fixture", type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2026, 10, 10), status=NotificationStatus.SENT)
    other: NotificationLog = NotificationLog(user_id=test_mentor.id, recipient="mentor-fixture", type=NotificationType.EXAM_RESULT, related_entity_id=2, notification_date=date(2026, 10, 10), status=NotificationStatus.SENT)
    db_session.add_all([own, other])
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"})
    assert login.status_code == 200
    authorization: dict[str, str] = {"Authorization": f"Bearer {login.json()['access_token']}"}
    listing = await client.get("/api/v1/notifications/", headers=authorization)
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["items"]] == [own.id]
    denied = await client.patch(f"/api/v1/notifications/{other.id}/read", headers=authorization)
    assert denied.status_code == 403
    await db_session.refresh(other)
    assert other.read_at is None
    completed = await client.patch(f"/api/v1/notifications/{own.id}/read", headers=authorization)
    assert completed.status_code == 200
    assert completed.json()["read_at"] is not None
    repeated = await client.patch(f"/api/v1/notifications/{own.id}/read", headers=authorization)
    assert repeated.status_code == 200
    assert repeated.json()["read_at"] == completed.json()["read_at"]
    count = await client.get("/api/v1/notifications/unread-count", headers=authorization)
    assert count.status_code == 200
    assert count.json()["unread_count"] == 0
