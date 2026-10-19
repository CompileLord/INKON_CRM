import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.user import User


from journal_test_support import _create_course


@pytest.mark.asyncio
async def test_course_journals_aggregated_aggregates(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get(f"/api/v1/courses/{course_id}/journals", headers=mentor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0

    first = data[0]
    assert "student_count" in first
    assert first["student_count"] == 1
    assert "lesson_count" in first
    assert "cells_expected" in first
    assert first["cells_expected"] == first["student_count"] * first["lesson_count"]
    assert "cells_filled" in first
    assert "avg_percentage" in first
    assert "state" in first
    assert first["state"] in ("upcoming", "empty", "partial", "complete")


@pytest.mark.asyncio
async def test_course_journal_metrics_endpoint(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get(f"/api/v1/courses/{course_id}/journal-metrics", headers=mentor_headers)
    assert resp.status_code == 200
    metrics = resp.json()
    assert "class_avg_percentage" in metrics
    assert "attendance_rate" in metrics
    assert "periods_total" in metrics
    assert "periods_complete" in metrics
    assert "at_risk_count" in metrics
    assert metrics["at_risk_threshold"] == 60


@pytest.mark.asyncio
async def test_mentor_grading_queue_endpoint(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post(
        "/api/v1/enrollments/",
        json={"student_id": test_student.id, "course_id": course_id},
        headers=admin_headers
    )

    resp = await client.get("/api/v1/mentors/me/grading-queue", headers=mentor_headers)
    assert resp.status_code == 200
    queue = resp.json()
    assert isinstance(queue, list)
    if len(queue) > 0:
        first = queue[0]
        assert "journal_id" in first
        assert "course_id" in first
        assert "course_title" in first
        assert "period_label" in first
        assert "state" in first
        assert "cells_filled" in first
        assert "cells_expected" in first
        assert "is_current" in first
