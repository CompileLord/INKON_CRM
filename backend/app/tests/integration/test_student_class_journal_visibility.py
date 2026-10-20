from typing import Any, Dict, List
import pytest
from httpx import AsyncClient, Response
from app.tests.integration.test_student_class_journal import (
    CLASSMATE_COMMENT, CLASSMATE_EMAIL, CLASSMATE_PARENT_PHONE, CLASSMATE_PHONE, ClassRoom, authorization, classroom,
)

__all__ = ["classroom"]


@pytest.mark.asyncio
async def test_class_journal_shows_classmate_names_and_scores_but_not_comments_or_contacts(
    client: AsyncClient, classroom: ClassRoom,
) -> None:
    response: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}/class", headers=authorization(classroom.own))
    assert response.status_code == 200
    body: Dict[str, Any] = response.json()
    records: List[Dict[str, Any]] = body["students"]
    assert {record["student_id"] for record in records} == {classroom.own.id, classroom.classmate.id, classroom.second_classmate.id}
    assert records[0]["student_id"] == classroom.own.id
    assert [record["is_self"] for record in records] == [True, False, False]
    by_id: Dict[int, Dict[str, Any]] = {record["student_id"]: record for record in records}
    assert by_id[classroom.classmate.id]["first_name"] == classroom.classmate.first_name
    assert by_id[classroom.classmate.id]["entries"][0]["score"] == 2
    assert by_id[classroom.second_classmate.id]["entries"][0]["score"] == 1
    assert by_id[classroom.classmate.id]["summary"]["max_period_score"] > 0
    assert body["class_size"] == 3
    for classmate in (classroom.classmate, classroom.second_classmate):
        for entry in by_id[classmate.id]["entries"]:
            assert entry["comment"] is None
            assert entry["has_comment"] is False
    for forbidden in (CLASSMATE_COMMENT, "Second private feedback", CLASSMATE_EMAIL, CLASSMATE_PHONE, CLASSMATE_PARENT_PHONE, "second@example.com"):
        assert forbidden not in response.text


@pytest.mark.asyncio
async def test_student_gets_403_on_every_journal_write_route(client: AsyncClient, classroom: ClassRoom) -> None:
    from app.main import app
    sample_bodies: Dict[tuple[str, str], Any] = {
        ("PUT", "/api/v1/journals/{id}/entries"): [{"student_id": classroom.own.id, "lesson_date": classroom.lesson_date, "attendance": True, "score": 5, "comment": "x", "version": 1}],
        ("PATCH", "/api/v1/journals/{journal_id}/students/{student_id}/summary"): {"exam_score": 50, "bonus_score": 10, "version": 1},
        ("PATCH", "/api/v1/journals/{id}/exam-max-score"): {"exam_max_score": 10},
    }
    write_routes: List[tuple[str, str]] = sorted(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/v1/journals")
        for method in operations
        if method.upper() not in ("GET", "HEAD", "OPTIONS")
    )
    assert write_routes
    assert set(write_routes) == set(sample_bodies)
    for method, path_template in write_routes:
        url: str = path_template.replace("{id}", str(classroom.journal_id)).replace("{journal_id}", str(classroom.journal_id)).replace("{student_id}", str(classroom.own.id))
        response: Response = await client.request(method, url, json=sample_bodies[(method, path_template)], headers=authorization(classroom.own))
        assert response.status_code == 403, (method, path_template)


@pytest.mark.asyncio
async def test_student_cannot_write_journal_entries_summaries_or_exam_maximum(client: AsyncClient, classroom: ClassRoom) -> None:
    headers: Dict[str, str] = authorization(classroom.own)
    entries: Response = await client.put(
        f"/api/v1/journals/{classroom.journal_id}/entries",
        json=[{"student_id": classroom.own.id, "lesson_date": classroom.lesson_date, "attendance": True, "score": 5, "comment": "self", "version": 1}],
        headers=headers,
    )
    summary: Response = await client.patch(
        f"/api/v1/journals/{classroom.journal_id}/students/{classroom.own.id}/summary",
        json={"exam_score": 50, "bonus_score": 10, "version": 1},
        headers=headers,
    )
    exam_maximum: Response = await client.patch(f"/api/v1/journals/{classroom.journal_id}/exam-max-score", json={"exam_max_score": 10}, headers=headers)
    assert (entries.status_code, summary.status_code, exam_maximum.status_code) == (403, 403, 403)
