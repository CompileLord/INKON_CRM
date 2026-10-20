from datetime import date, timedelta
from decimal import Decimal
from typing import Any
import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import create_access_token
from app.models.course import Course
from app.models.enrollment import Enrollment
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User


class HistoryFixture:
    @staticmethod
    def headers(student: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(student.id, student.role)}"}

    @staticmethod
    async def create(session: AsyncSession, student: User, mentor: User, count: int, enrolled: bool = True) -> tuple[int, list[int]]:
        course: Course = Course(title="History", description="Synthetic", start_date=date(2020, 1, 1),
                                end_date=date(2030, 1, 1), exam_type="monthly", price=Decimal("100.00"), mentor_id=mentor.id)
        session.add(course)
        await session.flush()
        if enrolled:
            session.add(Enrollment(student_id=student.id, course_id=course.id, price_at_enrollment=Decimal("100.00"), color_hex="#112233"))
        journals: list[Journal] = [Journal(course_id=course.id, period_label=f"Period {index}",
            period_start=date(2020, 1, 1) + timedelta(days=index // 3),
            period_end=date(2020, 1, 2) + timedelta(days=index // 3), period_type=JournalPeriodType.MONTH) for index in range(count)]
        session.add_all(journals)
        await session.flush()
        journal: Journal
        for journal in journals:
            session.add(JournalStudentSummary(journal_id=journal.id, student_id=student.id, sum_score=0,
                max_period_score=100, attendance_count=0, total_lessons=2, is_graded=True))
        await session.commit()
        return course.id, [journal.id for journal in journals]


@pytest.mark.asyncio
async def test_tied_history_dates_have_stable_complete_pages(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    course_id: int
    journal_ids: list[int]
    course_id, journal_ids = await HistoryFixture.create(db_session, test_student, test_mentor, 27)
    observed: list[int] = []
    cursor: str | None = None
    while True:
        parameters: dict[str, Any] = {"course_id": course_id, "page_size": 4}
        if cursor is not None:
            parameters["cursor"] = cursor
        response: Response = await client.get("/api/v1/students/me/journals/page", params=parameters, headers=HistoryFixture.headers(test_student))
        assert response.status_code == 200
        payload: dict[str, Any] = response.json()
        assert len(payload["items"]) <= 4
        observed.extend(item["journal_id"] for item in payload["items"])
        cursor = payload["next_cursor"]
        if cursor is None:
            break
    assert observed == list(reversed(journal_ids))
    assert len(observed) == len(set(observed))


@pytest.mark.asyncio
async def test_history_default_limit_and_legacy_overflow_are_explicit(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    await HistoryFixture.create(db_session, test_student, test_mentor, 101)
    response: Response = await client.get("/api/v1/students/me/journals/page", headers=HistoryFixture.headers(test_student))
    assert response.status_code == 200
    assert len(response.json()["items"]) == 20
    assert response.json()["next_cursor"] is not None
    legacy: Response = await client.get("/api/v1/students/me/journals", headers=HistoryFixture.headers(test_student))
    assert legacy.status_code == 409


@pytest.mark.asyncio
async def test_legacy_history_preserves_zero_scores_and_array_for_cap(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    await HistoryFixture.create(db_session, test_student, test_mentor, 100)
    response: Response = await client.get("/api/v1/students/me/journals", headers=HistoryFixture.headers(test_student))
    assert response.status_code == 200
    assert len(response.json()) == 100
    assert all(item["sum_score"] == 0 and item["state"] == "graded" for item in response.json())


@pytest.mark.asyncio
async def test_unauthorized_course_filter_fails_before_history_query(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    course_id: int
    journal_ids: list[int]
    course_id, journal_ids = await HistoryFixture.create(db_session, test_student, test_mentor, 2, enrolled=False)
    response: Response = await client.get("/api/v1/students/me/journals/page", params={"course_id": course_id}, headers=HistoryFixture.headers(test_student))
    assert response.status_code == 403
    legacy: Response = await client.get("/api/v1/students/me/journals", params={"course_id": course_id}, headers=HistoryFixture.headers(test_student))
    assert legacy.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("parameters", [{"page_size": 0}, {"page_size": 101}, {"page_size": -1}, {"course_id": 0}, {"cursor": "garbage"}, {"cursor": "A" * 2049}, {"unknown": "value"}])
async def test_invalid_history_parameters_are_rejected(client: AsyncClient, test_student: User, parameters: dict[str, Any]) -> None:
    response: Response = await client.get("/api/v1/students/me/journals/page", params=parameters, headers=HistoryFixture.headers(test_student))
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_started_filter_keeps_future_rows_from_hiding_latest_started_and_preserves_states(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    course_id: int
    ids: list[int]
    course_id, ids = await HistoryFixture.create(db_session, test_student, test_mentor, 3)
    today: date = datetime.now(ZoneInfo("Asia/Dushanbe")).date()
    index: int
    for index in range(3):
        journal: Journal | None = await db_session.get(Journal, ids[index])
        assert journal is not None
        journal.period_start = today + timedelta(days=index - 1)
        journal.period_end = journal.period_start + timedelta(days=1)
    from sqlalchemy import select
    summary: JournalStudentSummary = (await db_session.execute(select(JournalStudentSummary).where(JournalStudentSummary.journal_id == ids[1]))).scalar_one()
    summary.is_graded = None
    await db_session.commit()
    response: Response = await client.get("/api/v1/students/me/journals/page", params={"course_id": course_id, "page_size": 1, "started_only": True}, headers=HistoryFixture.headers(test_student))
    assert response.status_code == 200
    assert response.json()["items"][0]["journal_id"] == ids[1]
    assert response.json()["items"][0]["state"] == "in_progress"
    assert response.json()["next_cursor"] is not None
    legacy: Response = await client.get("/api/v1/students/me/journals", params={"course_id": course_id}, headers=HistoryFixture.headers(test_student))
    assert legacy.status_code == 200
    assert {item["journal_id"]: item["state"] for item in legacy.json()} == {ids[0]: "graded", ids[1]: "in_progress", ids[2]: "upcoming"}


@pytest.mark.asyncio
async def test_nonstudent_cannot_read_history_page(client: AsyncClient, test_mentor: User) -> None:
    response: Response = await client.get("/api/v1/students/me/journals/page", headers=HistoryFixture.headers(test_mentor))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_future_only_metadata_is_scoped_and_empty_history_remains_distinct(client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User) -> None:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    foreign_course_id: int
    foreign_ids: list[int]
    foreign_course_id, foreign_ids = await HistoryFixture.create(db_session, test_student, test_mentor, 1, enrolled=False)
    today: date = datetime.now(ZoneInfo("Asia/Dushanbe")).date()
    foreign: Journal | None = await db_session.get(Journal, foreign_ids[0])
    assert foreign is not None
    foreign.period_start = today + timedelta(days=2)
    foreign.period_end = today + timedelta(days=3)
    await db_session.commit()
    empty: Response = await client.get("/api/v1/students/me/journals/page", params={"started_only": True}, headers=HistoryFixture.headers(test_student))
    assert empty.status_code == 200
    assert empty.json() == {"items": [], "next_cursor": None, "has_upcoming_periods": False}
    course_id: int
    ids: list[int]
    course_id, ids = await HistoryFixture.create(db_session, test_student, test_mentor, 1)
    journal: Journal | None = await db_session.get(Journal, ids[0])
    assert journal is not None
    journal.period_start = today + timedelta(days=1)
    journal.period_end = today + timedelta(days=2)
    await db_session.commit()
    future: Response = await client.get("/api/v1/students/me/journals/page", params={"course_id": course_id, "started_only": True}, headers=HistoryFixture.headers(test_student))
    assert future.status_code == 200
    assert future.json() == {"items": [], "next_cursor": None, "has_upcoming_periods": True}
    hidden: Response = await client.get("/api/v1/students/me/journals/page", params={"course_id": foreign_course_id, "started_only": True}, headers=HistoryFixture.headers(test_student))
    assert hidden.status_code == 403
