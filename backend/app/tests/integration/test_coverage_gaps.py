import json
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.redis import redis_client
from app.core.security import verify_password
from app.models.user import User
from app.models.course import Course
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from datetime import date, datetime, timezone
from app.tests.factories import auth_headers


@pytest.mark.asyncio
async def test_logout_revokes_rotated_refresh_token(client: AsyncClient, test_student: User) -> None:
    resend_response: Response = await client.post(
        "/api/v1/auth/resend-code", json={"email": test_student.email}
    )
    assert resend_response.status_code == 204
    login_response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_student.email, "password": "student_pass123"},
    )
    assert login_response.status_code == 200
    original_refresh_token: str = login_response.json()["refresh_token"]
    refresh_response: Response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": original_refresh_token}
    )
    assert refresh_response.status_code == 200
    rotated_refresh_token: str = refresh_response.json()["refresh_token"]
    assert rotated_refresh_token != original_refresh_token
    logout_response: Response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": rotated_refresh_token}
    )
    assert logout_response.status_code == 204
    rejected_refresh: Response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": rotated_refresh_token}
    )
    assert rejected_refresh.status_code == 401
    assert rejected_refresh.json()["detail"] == "Invalid refresh token"


@pytest.mark.asyncio
async def test_password_reset_invalid_token_preserves_password(
    client: AsyncClient, test_student: User, db_session: AsyncSession
) -> None:
    original_password_hash: str = test_student.password_hash
    confirm_response: Response = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"reset_token": "0" * 64, "new_password": "NewPassword123!"},
    )
    assert confirm_response.status_code == 400
    assert confirm_response.json()["detail"] == "Invalid or expired reset token"
    persisted_student: User | None = await db_session.get(User, test_student.id)
    assert persisted_student is not None
    await db_session.refresh(persisted_student)
    assert persisted_student.password_hash == original_password_hash


@pytest.mark.asyncio
async def test_password_reset_success_and_replay_rejection(
    client: AsyncClient, test_mentor: User, db_session: AsyncSession
) -> None:
    request_response: Response = await client.post(
        "/api/v1/auth/password-reset/request", json={"email": test_mentor.email}
    )
    assert request_response.status_code == 200
    challenge_json: str | None = await redis_client.get(f"auth:reset:{test_mentor.email}")
    assert challenge_json is not None
    challenge: dict[str, str | int] = json.loads(challenge_json)
    invalid_code_response: Response = await client.post(
        "/api/v1/auth/password-reset/verify",
        json={"email": test_mentor.email, "code": "000000"},
    )
    assert invalid_code_response.status_code == 400
    assert invalid_code_response.json()["detail"] == "Invalid or expired reset code"
    verify_response: Response = await client.post(
        "/api/v1/auth/password-reset/verify",
        json={"email": test_mentor.email, "code": challenge["code"]},
    )
    assert verify_response.status_code == 200
    reset_token: str = verify_response.json()["reset_token"]
    confirm_response: Response = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"reset_token": reset_token, "new_password": "NewPassword123!"},
    )
    assert confirm_response.status_code == 200
    assert confirm_response.json()["refresh_token"]
    persisted_mentor: User | None = await db_session.get(User, test_mentor.id)
    assert persisted_mentor is not None
    await db_session.refresh(persisted_mentor)
    assert verify_password("NewPassword123!", persisted_mentor.password_hash)
    assert not verify_password("mentor_pass123", persisted_mentor.password_hash)
    replay_response: Response = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"reset_token": reset_token, "new_password": "ReplayPassword456!"},
    )
    assert replay_response.status_code == 400
    assert replay_response.json()["detail"] == "Invalid or expired reset token"
    await db_session.refresh(persisted_mentor)
    assert verify_password("NewPassword123!", persisted_mentor.password_hash)
    login_response: Response = await client.post(
        "/api/v1/auth/login",
        json={"email": test_mentor.email, "password": "NewPassword123!"},
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_user_update_and_self_update(client: AsyncClient, test_admin: User, test_student: User):
    admin_headers = auth_headers(test_admin)
    student_headers = auth_headers(test_student)

    # Superadmin updates user
    res = await client.patch(f"/api/v1/users/{test_student.id}", json={"first_name": "UpdatedName"}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["first_name"] == "UpdatedName"

    # Non-admin patch /users/{id} forbidden
    res_bad = await client.patch(f"/api/v1/users/{test_student.id}", json={"first_name": "HackerName"}, headers=student_headers)
    assert res_bad.status_code == 403

    # Student self update via /users/me
    res_me = await client.patch("/api/v1/users/me", json={"first_name": "SelfName"}, headers=student_headers)
    assert res_me.status_code == 200
    assert res_me.json()["first_name"] == "SelfName"


@pytest.mark.asyncio
async def test_course_get_schedule_delete(client: AsyncClient, test_admin: User, test_mentor: User):
    headers = auth_headers(test_admin)

    # Create course first
    res = await client.post("/api/v1/courses/", json={
        "title": "Coverage Course",
        "description": "Coverage Course Desc",
        "start_date": "2025-01-01",
        "end_date": "2025-03-01",
        "exam_type": "weekly",
        "price": 1200.0,
        "mentor_id": test_mentor.id,
        "schedules": [{"day_of_week": 1, "time_start": "10:00:00", "time_end": "12:00:00"}]
    }, headers=headers)
    assert res.status_code == 201
    course_id = res.json()["id"]

    # GET course by id
    res_get = await client.get(f"/api/v1/courses/{course_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["title"] == "Coverage Course"

    # GET course schedule
    res_sched = await client.get(f"/api/v1/courses/{course_id}/schedule", headers=headers)
    assert res_sched.status_code == 200
    assert len(res_sched.json()) >= 1

    # DELETE course
    res_del = await client.delete(f"/api/v1/courses/{course_id}", headers=headers)
    assert res_del.status_code == 204


@pytest.mark.asyncio
async def test_mentor_profile_non_self_rbac(client: AsyncClient, test_student: User, test_mentor: User):
    student_headers = auth_headers(test_student)
    res = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=student_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_notifications_endpoints(client: AsyncClient, test_student: User, db_session: AsyncSession) -> None:
    # Seed notification log for student
    log: NotificationLog = NotificationLog(
        user_id=test_student.id,
        recipient=test_student.email,
        type=NotificationType.EXAM_RESULT,
        related_entity_id=1,
        notification_date=date.today(),
        status=NotificationStatus.SENT,
        sent_at=datetime.now(timezone.utc),
    )
    db_session.add(log)
    await db_session.commit()
    await db_session.refresh(log)

    headers: dict[str, str] = auth_headers(test_student)

    # GET /notifications/
    res_list: Response = await client.get("/api/v1/notifications/", headers=headers)
    assert res_list.status_code == 200
    data: dict[str, Any] = res_list.json()
    assert data["total"] >= 1

    # GET /notifications/unread-count
    res_count: Response = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res_count.status_code == 200
    assert res_count.json()["unread_count"] >= 1

    # PATCH /notifications/{id}/read
    res_read: Response = await client.patch(f"/api/v1/notifications/{log.id}/read", headers=headers)
    assert res_read.status_code == 200
    assert res_read.json()["read_at"] is not None
