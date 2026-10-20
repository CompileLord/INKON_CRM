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
async def test_student_cannot_create_journal_entries_or_read_staff_journal(client: AsyncClient, classroom: ClassRoom) -> None:
    headers: Dict[str, str] = authorization(classroom.own)
    created: Response = await client.post(
        f"/api/v1/journals/{classroom.journal_id}/entries",
        json=[{"student_id": classroom.classmate.id, "lesson_date": classroom.lesson_date, "attendance": True, "score": 5, "version": 1}],
        headers=headers,
    )
    assert created.status_code in (403, 405)
    staff_view: Response = await client.get(f"/api/v1/journals/{classroom.journal_id}", headers=headers)
    assert CLASSMATE_COMMENT not in staff_view.text
    assert "second@example.com" not in staff_view.text


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
