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


async def login_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_personal_inbox_never_discloses_internal_error_markers(
    client: AsyncClient, db_session: AsyncSession, test_student: User,
) -> None:
    db_session.add(NotificationLog(user_id=test_student.id, recipient="chat-1", type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2026, 10, 10), status=NotificationStatus.FAILED, error_message="score:97 Traceback secret"))
    await db_session.commit()
    headers = await login_headers(client, test_student.email, "student_pass123")
    listing = await client.get("/api/v1/notifications/", headers=headers)
    assert listing.status_code == 200
    assert "error_message" not in listing.json()["items"][0]
    assert "Traceback" not in listing.text and "score:97" not in listing.text


@pytest.mark.asyncio
async def test_mark_all_read_changes_only_the_callers_notifications(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    mine = [NotificationLog(user_id=test_student.id, recipient=f"s-{index}", type=NotificationType.EXAM_RESULT, related_entity_id=index, notification_date=date(2026, 10, 10), status=NotificationStatus.SENT) for index in range(3)]
    theirs = NotificationLog(user_id=test_mentor.id, recipient="m-1", type=NotificationType.EXAM_RESULT, related_entity_id=99, notification_date=date(2026, 10, 10), status=NotificationStatus.SENT)
    db_session.add_all([*mine, theirs])
    await db_session.commit()
    headers = await login_headers(client, test_student.email, "student_pass123")
    first = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert first.status_code == 200
    assert first.json() == {"updated_count": 3}
    second = await client.post("/api/v1/notifications/read-all", headers=headers)
    assert second.json() == {"updated_count": 0}
    await db_session.refresh(theirs)
    assert theirs.read_at is None
    assert (await client.get("/api/v1/notifications/unread-count", headers=headers)).json() == {"unread_count": 0}
    mentor_headers = await login_headers(client, test_mentor.email, "mentor_pass123")
    assert (await client.get("/api/v1/notifications/unread-count", headers=mentor_headers)).json() == {"unread_count": 1}


@pytest.mark.asyncio
async def test_delivery_log_is_superadmin_only_filterable_and_hides_internal_fields(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_student: User, test_mentor: User,
) -> None:
    db_session.add_all([
        NotificationLog(user_id=test_student.id, recipient="chat-secret-1", type=NotificationType.EXAM_RESULT, related_entity_id=1, notification_date=date(2026, 10, 10), status=NotificationStatus.SENT, attempts=1),
        NotificationLog(user_id=test_mentor.id, recipient="chat-secret-2", type=NotificationType.PAYMENT_REMINDER_1D, related_entity_id=2, notification_date=date(2026, 10, 11), status=NotificationStatus.FAILED, attempts=3, error_message="Traceback boom"),
        NotificationLog(user_id=None, recipient="chat-secret-3", type=NotificationType.PAYMENT_REMINDER_2D, related_entity_id=3, notification_date=date(2026, 10, 9), status=NotificationStatus.SENT, attempts=1),
    ])
    await db_session.commit()
    for email, password in ((test_student.email, "student_pass123"), (test_mentor.email, "mentor_pass123")):
        denied = await client.get("/api/v1/notifications/delivery-log", headers=await login_headers(client, email, password))
        assert denied.status_code == 403
    assert (await client.get("/api/v1/notifications/delivery-log")).status_code == 401
    headers = await login_headers(client, test_admin.email, "admin_pass123")
    everything = await client.get("/api/v1/notifications/delivery-log", headers=headers)
    assert everything.status_code == 200
    assert everything.json()["total"] == 3
    assert "chat-secret" not in everything.text and "Traceback" not in everything.text and "error_message" not in everything.text
    names = [item["recipient_name"] for item in everything.json()["items"]]
    assert names[0] == f"{test_mentor.first_name} {test_mentor.last_name}"
    assert names[2] is None or names[-1] is None
    failed = await client.get("/api/v1/notifications/delivery-log", headers=headers, params={"status": "failed"})
    assert failed.json()["total"] == 1
    assert failed.json()["items"][0]["status"] == "failed"
    invalid = await client.get("/api/v1/notifications/delivery-log", headers=headers, params={"status": "queued"})
    assert invalid.status_code == 422


class StubBotIdentity:
    username: str = "kitob_test_bot"


class StubReachableBot:
    async def get_me(self) -> StubBotIdentity:
        return StubBotIdentity()


class StubUnreachableBot:
    async def get_me(self) -> StubBotIdentity:
        raise ConnectionError("network down with token 123456:secret")


@pytest.mark.asyncio
async def test_telegram_bot_check_is_superadmin_only_and_reports_reachability(
    client: AsyncClient, test_admin: User, test_mentor: User,
) -> None:
    from app.api.v1.settings import get_telegram_status_service
    from app.main import app
    from app.services.telegram_status_service import TelegramStatusService

    denied = await client.post("/api/v1/settings/telegram/test", headers=await login_headers(client, test_mentor.email, "mentor_pass123"))
    assert denied.status_code == 403
    headers = await login_headers(client, test_admin.email, "admin_pass123")
    app.dependency_overrides[get_telegram_status_service] = lambda: TelegramStatusService(StubReachableBot())
    reachable = await client.post("/api/v1/settings/telegram/test", headers=headers)
    assert reachable.json() == {"reachable": True, "bot_username": "kitob_test_bot"}
    app.dependency_overrides[get_telegram_status_service] = lambda: TelegramStatusService(StubUnreachableBot())
    unreachable = await client.post("/api/v1/settings/telegram/test", headers=headers)
    assert unreachable.status_code == 200
    assert unreachable.json() == {"reachable": False, "bot_username": None}
    assert "secret" not in unreachable.text
