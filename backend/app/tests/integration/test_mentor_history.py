import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User


@pytest.mark.asyncio
async def test_mentor_history_logs_workflow(client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession) -> None:
    admin_token = create_access_token(test_admin.id, test_admin.role)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create Mentor B
    mentor_b_resp = await client.post(
        "/api/v1/users/",
        json={
            "email": "mentor_b@example.com",
            "first_name": "Mentor",
            "last_name": "B",
            "role": "mentor"
        },
        headers=admin_headers
    )
    mentor_b_id = mentor_b_resp.json()["id"]

    # 1. Create course (with Mentor A/test_mentor)
    course_resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": "History Course",
            "description": "History course",
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 1,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=admin_headers
    )
    course_id = course_resp.json()["id"]

    # 2. Retrieve history -> verify 1 entry (Mentor A) with assigned_to = None
    history_resp = await client.get(f"/api/v1/courses/{course_id}/mentor-history", headers=admin_headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) == 1
    assert history[0]["mentor_id"] == test_mentor.id
    assert history[0]["assigned_to"] is None

    # 3. Update course mentor to Mentor B
    patch_resp = await client.patch(
        f"/api/v1/courses/{course_id}",
        json={"mentor_id": mentor_b_id},
        headers=admin_headers
    )
    assert patch_resp.status_code == 200

    # 4. Retrieve history -> verify 2 entries
    history_resp2 = await client.get(f"/api/v1/courses/{course_id}/mentor-history", headers=admin_headers)
    assert history_resp2.status_code == 200
    history2 = history_resp2.json()
    assert len(history2) == 2

    # Check chaining
    assert history2[0]["mentor_id"] == test_mentor.id
    assert history2[0]["assigned_to"] is not None
    assert history2[1]["mentor_id"] == mentor_b_id
    assert history2[1]["assigned_to"] is None

    # 5. Soft-delete Mentor B
    del_mentor_resp = await client.delete(f"/api/v1/users/{mentor_b_id}", headers=admin_headers)
    assert del_mentor_resp.status_code == 204

    # 6. Retrieve history again -> verify log persists and mentor has is_deleted=True
    history_resp3 = await client.get(f"/api/v1/courses/{course_id}/mentor-history", headers=admin_headers)
    assert history_resp3.status_code == 200
    history3 = history_resp3.json()
    assert len(history3) == 2
    assert history3[1]["mentor_id"] == mentor_b_id
    assert history3[1]["mentor"]["is_deleted"] is True

    # 7. Access control check: Mentor tries to access history -> 403
    mentor_token = create_access_token(test_mentor.id, test_mentor.role)
    mentor_headers = {"Authorization": f"Bearer {mentor_token}"}
    rbac_resp = await client.get(f"/api/v1/courses/{course_id}/mentor-history", headers=mentor_headers)
    assert rbac_resp.status_code == 403
