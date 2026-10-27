from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base
from app.models.user import User
from app.models.journal_entry import JournalEntry
from app.tests.conftest import TestingSessionLocal
from app.tests.integration.uat_u07_support import U07AuditSupport


class U17Support(U07AuditSupport):
    @staticmethod
    def schedules(start: str = "16:00:00", end: str = "17:30:00") -> list[dict[str, Any]]:
        return [{"day_of_week": weekday, "time_start": start, "time_end": end} for weekday in (0, 2, 4)]

    async def create(self, client: AsyncClient, actor: User, mentor: User) -> int:
        today: date = date.today()
        response: Response = await client.post("/api/v1/courses/", headers=self.headers(actor), json={
            "title": "U17 times", "description": "Weekly times", "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=35)).isoformat(), "exam_type": "weekly", "price": "300.00",
            "mentor_id": mentor.id, "schedules": self.schedules("14:00:00", "15:30:00"),
        })
        assert response.status_code == 201, response.text
        return response.json()["id"]

    async def snapshot(self) -> dict[str, list[dict[str, Any]]]:
        session: AsyncSession
        snapshot: dict[str, list[dict[str, Any]]] = {}
        table_name: str
        async with TestingSessionLocal() as session:
            for table_name in ("journals", "journal_entries", "journal_student_summaries", "charges", "enrollments"):
                snapshot[table_name] = [dict(row) for row in (await session.execute(select(Base.metadata.tables[table_name]))).mappings().all()]
        return snapshot

    async def reads(self, client: AsyncClient, actor: User, student: User, identifier: int) -> dict[str, Any]:
        schedule: Response = await client.get(f"/api/v1/courses/{identifier}/schedule", headers=self.headers(actor))
        listing: Response = await client.get("/api/v1/courses/", headers=self.headers(actor))
        profile: Response = await client.get("/api/v1/students/me/profile", headers=self.headers(student))
        detail: Response = await client.get(f"/api/v1/courses/{identifier}", headers=self.headers(actor))
        assert schedule.status_code == listing.status_code == profile.status_code == detail.status_code == 200
        return {"schedule": schedule.json(), "listing": listing.json()["items"][0]["schedules"], "next": profile.json()["courses"][0]["next_lesson_at"]}


@pytest.mark.asyncio
async def test_u17_updates_times_in_place_audits_and_preserves_learning_and_finance(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User,
) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    enrollment: Response = await client.post("/api/v1/enrollments/", headers=support.headers(test_admin), json={"course_id": identifier, "student_id": test_student.id})
    assert enrollment.status_code == 201, enrollment.text
    session: AsyncSession
    async with TestingSessionLocal() as session:
        entry: JournalEntry = (await session.execute(select(JournalEntry).order_by(JournalEntry.id).limit(1))).scalar_one()
        entry.attendance = True
        entry.score = 4
        entry.comment = "Preserve existing marks"
        await session.commit()
    before: dict[str, list[dict[str, Any]]] = await support.snapshot()
    assert all(before.values())
    old_reads: dict[str, Any] = await support.reads(client, test_admin, test_student, identifier)
    payload: list[dict[str, Any]] = support.schedules()
    payload[1]["time_start"] = "18:00:00"
    payload[1]["time_end"] = "19:00:00"
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json={"schedules": list(reversed(payload))})
    assert response.status_code == 200, response.text
    assert await support.snapshot() == before
    new_reads: dict[str, Any] = await support.reads(client, test_admin, test_student, identifier)
    key: str
    for key in ("schedule", "listing"):
        assert {row["day_of_week"]: (row["time_start"], row["time_end"]) for row in new_reads[key]} == {row["day_of_week"]: (row["time_start"], row["time_end"]) for row in payload}
        assert {row["id"] for row in new_reads[key]} == {row["id"] for row in old_reads[key]}
    assert new_reads["next"] != old_reads["next"]
    assert new_reads["next"][11:19] in {"16:00:00", "18:00:00"}
    changes: dict[str, tuple[str, str]] = {}
    schedule: dict[str, Any]
    for schedule in payload:
        changes[f"schedules.{schedule['day_of_week']}.time_start"] = ("14:00:00", schedule["time_start"])
        changes[f"schedules.{schedule['day_of_week']}.time_end"] = ("15:30:00", schedule["time_end"])
    await support.assert_change(client, test_admin, "course", identifier, "update", "U17 times", changes)
    repeated: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json={"schedules": payload})
    assert repeated.status_code == 200
    await support.assert_change(client, test_admin, "course", identifier, "update", "U17 times", changes)


@pytest.mark.asyncio
@pytest.mark.parametrize("weekdays", [[], [0, 2], [0, 2, 4, 6], [0, 2, 5], [0, 2, 2, 4]])
async def test_u17_rejects_weekday_changes(client: AsyncClient, test_admin: User, test_mentor: User, weekdays: list[int]) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json={"title": "Must roll back", "schedules": [{"day_of_week": weekday, "time_start": "16:00:00", "time_end": "17:00:00"} for weekday in weekdays]})
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["code"] == "schedule_weekdays_immutable"
    detail: Response = await client.get(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin))
    assert detail.json()["title"] == "U17 times"
    events: list[dict[str, Any]] = await support.events(client, test_admin, entity_type="course", entity_id=identifier, action="update")
    assert events == []


@pytest.mark.asyncio
@pytest.mark.parametrize("start,end", [("17:00", "17:00"), ("18:00", "17:00"), ("16:00+05:00", "17:00"), ("16:00", "17:00+05:00")])
async def test_u17_rejects_invalid_times(client: AsyncClient, test_admin: User, test_mentor: User, start: str, end: str) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json={"schedules": support.schedules(start, end)})
    assert response.status_code == 422, response.text
    assert response.json()["detail"][0]["type"] == "schedule_time_range_invalid"


@pytest.mark.asyncio
@pytest.mark.parametrize("extra", ["outer", "inner", "null"])
async def test_u17_forbids_extra_fields_and_null(client: AsyncClient, test_admin: User, test_mentor: User, extra: str) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    payload: dict[str, Any] = {"schedules": support.schedules()}
    if extra == "outer":
        payload["unexpected"] = True
    elif extra == "inner":
        payload["schedules"][0]["unexpected"] = True
    else:
        payload["schedules"] = None
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json=payload)
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_fixture", ["test_mentor", "test_student", "test_accountant"])
async def test_u17_denies_non_admin(client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, test_accountant: User, actor_fixture: str) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    actor: User = {"test_mentor": test_mentor, "test_student": test_student, "test_accountant": test_accountant}[actor_fixture]
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(actor), json={"schedules": support.schedules()})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_u17_audits_only_changed_fields_and_supports_shared_times(client: AsyncClient, test_admin: User, test_mentor: User) -> None:
    support: U17Support = U17Support()
    identifier: int = await support.create(client, test_admin, test_mentor)
    response: Response = await client.patch(f"/api/v1/courses/{identifier}", headers=support.headers(test_admin), json={"title": "New title", "schedules": support.schedules("14:30:00", "15:30:00")})
    assert response.status_code == 200, response.text
    changes: dict[str, tuple[str, str]] = {"title": ("U17 times", "New title")}
    weekday: int
    for weekday in (0, 2, 4):
        changes[f"schedules.{weekday}.time_start"] = ("14:00:00", "14:30:00")
    await support.assert_change(client, test_admin, "course", identifier, "update", "New title", changes)
    schedules: Response = await client.get(f"/api/v1/courses/{identifier}/schedule", headers=support.headers(test_admin))
    assert schedules.status_code == 200
    assert {schedule["time_start"] for schedule in schedules.json()} == {"14:30:00"}
    assert {schedule["time_end"] for schedule in schedules.json()} == {"15:30:00"}
