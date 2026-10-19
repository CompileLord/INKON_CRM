import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import create_access_token
from app.models.user import User
from app.models.journal import Journal


from journal_test_support import _create_course


@pytest.mark.asyncio
async def test_batch_update_partial_conflict(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    student2 = User(email="student2@example.com", first_name="Student", last_name="Two", role="student", must_set_password=False)
    db_session.add(student2)
    await db_session.commit()

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)
    await client.post("/api/v1/enrollments/", json={"student_id": student2.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    s1_entry = grid["students"][0]["entries"][0]
    s2_entry = grid["students"][1]["entries"][0]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": grid["students"][0]["student_id"],
                "lesson_date": str(s1_entry["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Good",
                "version": s1_entry["version"]
            },
            {
                "student_id": grid["students"][1]["student_id"],
                "lesson_date": str(s2_entry["lesson_date"]),
                "attendance": True,
                "score": 4,
                "comment": "Stale version test",
                "version": s2_entry["version"] + 999
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    res = put_resp.json()
    assert len(res["applied"]) == 1
    assert len(res["conflicts"]) == 1
    assert res["conflicts"][0]["submitted_version"] == s2_entry["version"] + 999
    assert res["conflicts"][0]["current"]["version"] == s2_entry["version"]

    get_resp = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    s1_updated = [s for s in get_resp["students"] if s["student_id"] == grid["students"][0]["student_id"]][0]["entries"][0]
    assert s1_updated["score"] == 5


@pytest.mark.asyncio
async def test_batch_update_returns_incremented_versions(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    entry = grid["students"][0]["entries"][0]
    v_initial = entry["version"]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 3,
                "comment": None,
                "version": v_initial
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    res = put_resp.json()
    v_returned = res["applied"][0]["version"]
    assert v_returned == v_initial + 1

    resubmit_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 5,
                "comment": "Chained update",
                "version": v_returned
            }
        ],
        headers=mentor_headers
    )
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["applied"][0]["version"] == v_returned + 1


@pytest.mark.asyncio
async def test_batch_update_returns_recalculated_summaries(
    client: AsyncClient, test_admin: User, test_mentor: User, test_student: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    await client.post("/api/v1/enrollments/", json={"student_id": test_student.id, "course_id": course_id}, headers=admin_headers)

    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    entry = grid["students"][0]["entries"][0]

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": str(entry["lesson_date"]),
                "attendance": True,
                "score": 4,
                "comment": None,
                "version": entry["version"]
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 200
    returned_summary = put_resp.json()["summaries"][0]

    get_resp = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    fetched_summary = get_resp["students"][0]["summary"]

    assert returned_summary["sum_score"] == fetched_summary["sum_score"]
    assert returned_summary["percentage"] == fetched_summary["percentage"]


@pytest.mark.asyncio
async def test_batch_update_missing_entry_is_conflict_not_404(
    client: AsyncClient, test_admin: User, test_mentor: User, db_session: AsyncSession
) -> None:
    admin_headers = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    mentor_headers = {"Authorization": f"Bearer {create_access_token(test_mentor.id, test_mentor.role)}"}

    course_id = await _create_course(client, admin_headers, test_mentor.id, "weekly")
    async with db_session.begin():
        journals_res = await db_session.execute(select(Journal).filter(Journal.course_id == course_id))
        journal_id = sorted(journals_res.scalars().all(), key=lambda j: j.period_start)[0].id

    put_resp = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": 999999,
                "lesson_date": "2026-08-01",
                "attendance": True,
                "score": 5,
                "comment": None,
                "version": 1
            }
        ],
        headers=mentor_headers
    )
    assert put_resp.status_code == 409
