import pytest
from httpx import AsyncClient
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import Course
from app.models.notification_log import NotificationLog, NotificationType, NotificationStatus
from datetime import date


def get_auth_headers(user: User):
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_auth_refresh_logout_resend_coverage(client: AsyncClient, test_student: User, db_session):
    test_student.must_set_password = True
    await db_session.commit()

    # Resend code
    res = await client.post("/api/v1/auth/resend-code", json={"email": test_student.email})
    assert res.status_code in [204, 400], res.text

    # Login to get tokens
    res = await client.post("/api/v1/auth/login", json={"email": test_student.email, "password": "student_pass123"})
    assert res.status_code == 200
    data = res.json()
    refresh_token = data["refresh_token"]

    # Test refresh
    res_ref = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res_ref.status_code == 200
    assert "access_token" in res_ref.json()

    # Test logout
    res_out = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert res_out.status_code in [200, 204]


@pytest.mark.asyncio
async def test_password_reset_flow(client: AsyncClient, test_student: User):
    # Request password reset
    res = await client.post("/api/v1/auth/password-reset/request", json={"email": test_student.email})
    assert res.status_code == 200

    # Verify code with invalid code
    res_v = await client.post("/api/v1/auth/password-reset/verify", json={"email": test_student.email, "code": "000000"})
    assert res_v.status_code in [400, 422]

    # Confirm with invalid payload
    res_c = await client.post("/api/v1/auth/password-reset/confirm", json={"token": "invalid", "new_password": "NewPassword123!"})
    assert res_c.status_code in [400, 401, 422]


@pytest.mark.asyncio
async def test_user_update_and_self_update(client: AsyncClient, test_admin: User, test_student: User):
    admin_headers = get_auth_headers(test_admin)
    student_headers = get_auth_headers(test_student)

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
    headers = get_auth_headers(test_admin)

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
    student_headers = get_auth_headers(test_student)
    res = await client.get(f"/api/v1/mentors/{test_mentor.id}/profile", headers=student_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_notifications_endpoints(client: AsyncClient, test_student: User, db_session):
    # Seed notification log for student
    log = NotificationLog(
        user_id=test_student.id,
        recipient=test_student.email,
        type=NotificationType.EXAM_RESULT,
        related_entity_id=1,
        notification_date=date.today(),
        status=NotificationStatus.SENT
    )
    db_session.add(log)
    await db_session.commit()
    await db_session.refresh(log)

    headers = get_auth_headers(test_student)

    # GET /notifications/
    res_list = await client.get("/api/v1/notifications/", headers=headers)
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] >= 1

    # GET /notifications/unread-count
    res_count = await client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res_count.status_code == 200
    assert res_count.json()["unread_count"] >= 1

    # PATCH /notifications/{id}/read
    res_read = await client.patch(f"/api/v1/notifications/{log.id}/read", headers=headers)
    assert res_read.status_code == 200
    assert res_read.json()["read_at"] is not None
