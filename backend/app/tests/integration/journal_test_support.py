from httpx import AsyncClient


async def _create_course(client: AsyncClient, headers: dict, mentor_id: int, exam_type: str) -> int:
    resp = await client.post(
        "/api/v1/courses/",
        json={
            "title": f"Course {exam_type}",
            "description": "Scoring fixture course",
            "start_date": "2026-08-01",
            "end_date": "2026-09-30",
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
