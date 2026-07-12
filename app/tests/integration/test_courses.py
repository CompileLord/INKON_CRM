import pytest
from datetime import date, time
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.course_mentor_history import CourseMentorHistory
from app.models.journal import Journal


@pytest.mark.asyncio
async def test_create_course_success(client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Programming",
            "description": "Learn python from scratch",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                },
                {
                    "day_of_week": 2,
                    "time_start": "14:00:00",
                    "time_end": "16:00:00"
                }
            ]
        },
        headers=headers
    )

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Python Programming"
    assert float(data["price"]) == 150.0

    course_id = data["id"]
    
    async with db_session.begin():
        schedules_result = await db_session.execute(
            select(CourseSchedule).filter(CourseSchedule.course_id == course_id)
        )
        schedules = list(schedules_result.scalars().all())
        assert len(schedules) == 2

        journals_result = await db_session.execute(
            select(Journal).filter(Journal.course_id == course_id)
        )
        journals = list(journals_result.scalars().all())
        assert len(journals) == 5

        history_result = await db_session.execute(
            select(CourseMentorHistory).filter(CourseMentorHistory.course_id == course_id)
        )
        history = list(history_result.scalars().all())
        assert len(history) == 1
        assert history[0].mentor_id == test_mentor.id
        assert history[0].assigned_to is None


@pytest.mark.asyncio
async def test_create_course_invalid_dates(client: AsyncClient, test_admin: User, test_mentor: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Programming",
            "description": "Learn python from scratch",
            "start_date": "2026-08-31",
            "end_date": "2026-08-01",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_course_invalid_schedule_time(client: AsyncClient, test_admin: User, test_mentor: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Programming",
            "description": "Learn python from scratch",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "12:00:00",
                    "time_end": "10:00:00"
                }
            ]
        },
        headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_course_duplicate_schedule_days(client: AsyncClient, test_admin: User, test_mentor: User) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Programming",
            "description": "Learn python from scratch",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                },
                {
                    "day_of_week": 0,
                    "time_start": "14:00:00",
                    "time_end": "16:00:00"
                }
            ]
        },
        headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_course_mentor_history(client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession) -> None:
    token = create_access_token(test_admin.id, test_admin.role)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Python Programming",
            "description": "Learn python from scratch",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "exam_type": "weekly",
            "price": "150.00",
            "mentor_id": test_mentor.id,
            "schedules": [
                {
                    "day_of_week": 0,
                    "time_start": "10:00:00",
                    "time_end": "12:00:00"
                }
            ]
        },
        headers=headers
    )
    course_id = response.json()["id"]

    other_mentor = User(
        email="mentor2@example.com",
        first_name="Mentor",
        last_name="Two",
        role="mentor",
        must_set_password=False
    )
    db_session.add(other_mentor)
    await db_session.commit()

    patch_response = await client.patch(
        f"/api/v1/courses/{course_id}",
        json={"mentor_id": other_mentor.id},
        headers=headers
    )
    assert patch_response.status_code == 200

    async with db_session.begin():
        history_result = await db_session.execute(
            select(CourseMentorHistory).filter(CourseMentorHistory.course_id == course_id).order_by(CourseMentorHistory.id)
        )
        history = list(history_result.scalars().all())
        assert len(history) == 2
        assert history[0].mentor_id == test_mentor.id
        assert history[0].assigned_to is not None
        assert history[1].mentor_id == other_mentor.id
        assert history[1].assigned_to is None
