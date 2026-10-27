from datetime import date, timedelta
from httpx import AsyncClient, Response
from app.core.school_calendar import SchoolCalendar


async def _create_course(client: AsyncClient, headers: dict[str, str], mentor_id: int, exam_type: str) -> int:
    today: date = SchoolCalendar.today()
    course_start: date = today - timedelta(days=today.weekday() + 28)
    course_end: date = today + timedelta(days=35)
    resp: Response = await client.post(
        "/api/v1/courses/",
        json={
            "title": f"Course {exam_type}",
            "description": "Scoring fixture course",
            "start_date": course_start.isoformat(),
            "end_date": course_end.isoformat(),
            "exam_type": exam_type,
            "price": "300.00",
            "mentor_id": mentor_id,
            "schedules": [
                {"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"},
                {"day_of_week": 2, "time_start": "18:00:00", "time_end": "20:00:00"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]
