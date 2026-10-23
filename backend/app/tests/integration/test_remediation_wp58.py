from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import insert, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.interfaces.course_progress_repository import CourseChartSnapshot
from app.repositories.sqlalchemy.course_progress_repository import SqlAlchemyCourseProgressRepository
from app.tests.integration.test_remediation_wp34 import ChartFixture


class BoundedChartFixture:
    @classmethod
    async def create(
        cls, session: AsyncSession, student: User, mentor: User
    ) -> tuple[Course, list[Journal], list[User]]:
        course: Course
        initial: list[Journal]
        peer: User
        course, initial, peer = await ChartFixture.create(session, student, mentor)
        journals: list[Journal] = []
        index: int
        for index in range(64):
            start: date = date.today() + timedelta(days=14 + index * 7)
            journals.append(Journal(
                course_id=course.id, period_label=f"Extra{index}", period_start=start,
                period_end=start + timedelta(days=6), period_type=JournalPeriodType.WEEK,
            ))
        session.add_all(journals)
        people: list[User] = [student, peer]
        for index in range(103):
            person: User = User(
                email=f"wp58-{index}@example.invalid", first_name="Bounded", last_name=str(index),
                role=UserRole.STUDENT, must_set_password=False,
            )
            session.add(person)
            await session.flush()
            session.add(Enrollment(
                course_id=course.id, student_id=person.id, price_at_enrollment=Decimal("100"),
                color_hex="#123456", status=EnrollmentStatus.ACTIVE,
            ))
            people.append(person)
        await session.flush()
        summaries: list[dict[str, int | bool]] = [
            {"journal_id": journal.id, "student_id": person.id, "sum_score": 50, "max_period_score": 100, "is_graded": True}
            for journal in journals for person in people
        ]
        await session.execute(insert(JournalStudentSummary), summaries)
        await session.commit()
        return course, initial + journals, people


@pytest.mark.asyncio
async def test_defaults_hard_caps_pages_and_period_order(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course
    journals: list[Journal]
    people: list[User]
    course, journals, people = await BoundedChartFixture.create(db_session, test_student, test_mentor)
    url: str = f"/api/v1/courses/{course.id}/progress-chart"
    response: Response = await client.get(url, headers=ChartFixture.headers(test_admin))
    data: dict[str, Any] = response.json()
    assert response.status_code == 200
    assert [period["id"] for period in data["periods"]] == [journal.id for journal in journals[-12:]]
    assert len(data["datasets"]) == 30
    assert data["periods_total"] == 70 and data["students_total"] == 105
    assert data["period_offset"] == 0 and data["period_limit"] == 12
    assert data["student_offset"] == 0 and data["student_limit"] == 30
    assert data["aggregation_scope"] == "selected_periods"
    response = await client.get(url, params={"period_offset": 12, "period_limit": 52, "student_offset": 30, "student_limit": 100}, headers=ChartFixture.headers(test_admin))
    data = response.json()
    assert [period["id"] for period in data["periods"]] == [journal.id for journal in journals[6:58]]
    assert [dataset["student_id"] for dataset in data["datasets"]] == [person.id for person in people[30:]]
    assert all(len(dataset["percentages"]) == 53 for dataset in data["datasets"])
    response = await client.get(url, params={"period_offset": 70, "student_offset": 105}, headers=ChartFixture.headers(test_admin))
    data = response.json()
    assert data["periods"] == [] and data["datasets"] == []
    assert data["class_avg_series"] == [None]
    response = await client.get(url, params={"period_offset": 70, "student_offset": 105}, headers=ChartFixture.headers(test_student))
    assert response.status_code == 200
    assert response.json()["periods"] == [] and response.json()["my_series"] == [None]
    assert response.json()["my_rank"] is None and response.json()["class_size"] == 105


@pytest.mark.asyncio
@pytest.mark.parametrize("parameters", [
    {"period_limit": "0"}, {"period_limit": "53"}, {"period_offset": "-1"},
    {"student_limit": "0"}, {"student_limit": "101"}, {"student_offset": "-1"},
    {"period_limit": "1.5"}, {"period_offset": "abc"}, {"unexpected": "1"},
    {"period_offset": "999999999999999999999"}, {"student_offset": "999999999999999999999"},
])
async def test_invalid_chart_bounds_return_422(
    client: AsyncClient, test_admin: User, parameters: dict[str, str],
) -> None:
    response: Response = await client.get(
        "/api/v1/courses/999999/progress-chart", params=parameters, headers=ChartFixture.headers(test_admin),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_selected_range_grading_rank_and_student_privacy(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course
    journals: list[Journal]
    peer: User
    course, journals, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    response: Response = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", params={"period_offset": 4, "period_limit": 1, "student_offset": 100},
        headers=ChartFixture.headers(test_student),
    )
    data: dict[str, Any] = response.json()
    assert response.status_code == 200
    assert set(data) == {
        "periods", "my_series", "class_avg_series", "my_grading_states", "my_graded_periods_count",
        "my_eligible_periods_count", "class_eligible_counts", "my_rank", "class_size", "period_offset",
        "period_limit", "periods_total", "aggregation_scope",
    }
    assert data["periods"] == [{"id": journals[1].id, "period_label": "P1"}]
    assert data["my_series"] == [None, None] and data["my_rank"] is None
    assert data["my_grading_states"] == ["ungraded"]
    assert data["class_avg_series"] == [100.0, 100.0]
    assert data["class_size"] == 2 and data["class_eligible_counts"] == [1]
    assert peer.email not in response.text and peer.first_name not in response.text
    snapshot: CourseChartSnapshot = await SqlAlchemyCourseProgressRepository(db_session).get_course_chart_snapshot(
        course.id, test_student.id, period_offset=5, period_limit=1, student_offset=100,
    )
    assert [person.student_id for person in snapshot.progress.students] == [test_student.id]
    assert {summary.student_id for summary in snapshot.progress.summaries} == {test_student.id}
    assert {aggregate.student_id for aggregate in snapshot.student_aggregates} == {test_student.id}
    assert set(snapshot.ranks) == {test_student.id}
    assert snapshot.class_size == 2


@pytest.mark.asyncio
async def test_page_filters_cohort_and_access_on_every_page(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course
    journals: list[Journal]
    people: list[User]
    course, journals, people = await BoundedChartFixture.create(db_session, test_student, test_mentor)
    await db_session.execute(update(Enrollment).where(Enrollment.student_id == people[1].id).values(status=EnrollmentStatus.WITHDRAWN))
    await db_session.execute(update(Enrollment).where(Enrollment.student_id == people[2].id).values(is_deleted=True))
    await db_session.execute(update(User).where(User.id == people[3].id).values(is_deleted=True))
    await db_session.execute(update(User).where(User.id == people[4].id).values(role=UserRole.MENTOR))
    await db_session.commit()
    response: Response = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", params={"student_offset": 1, "student_limit": 2},
        headers=ChartFixture.headers(test_admin),
    )
    assert response.status_code == 200
    assert response.json()["students_total"] == 101
    assert [dataset["student_id"] for dataset in response.json()["datasets"]] == [people[5].id, people[6].id]
    response = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", params={"student_offset": 100},
        headers=ChartFixture.headers(people[4]),
    )
    assert response.status_code == 403
    response = await client.get(
        f"/api/v1/courses/{course.id}/progress-chart", params={"student_offset": 100},
        headers=ChartFixture.headers(people[2]),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_repository_bounds_raw_records_and_aggregates(
    db_session: AsyncSession, test_student: User, test_mentor: User,
) -> None:
    course: Course
    journals: list[Journal]
    people: list[User]
    course, journals, people = await BoundedChartFixture.create(db_session, test_student, test_mentor)
    snapshot: CourseChartSnapshot = await SqlAlchemyCourseProgressRepository(db_session).get_course_chart_snapshot(
        course.id, period_offset=0, period_limit=2, student_offset=1, student_limit=1,
    )
    assert [period.id for period in snapshot.progress.periods] == [journal.id for journal in journals[-2:]]
    assert [person.student_id for person in snapshot.progress.students] == [people[1].id]
    assert len(snapshot.progress.summaries) == 2
    assert len(snapshot.student_aggregates) <= 1 and len(snapshot.period_aggregates) <= 2
    assert snapshot.ranks == {}


@pytest.mark.asyncio
async def test_same_date_period_tiebreak_and_page_independent_cohort_average(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    course: Course
    journals: list[Journal]
    peer: User
    course, journals, peer = await ChartFixture.create(db_session, test_student, test_mentor)
    await db_session.execute(update(Journal).where(Journal.id.in_([journals[0].id, journals[1].id])).values(period_start=journals[0].period_start))
    await db_session.commit()
    url: str = f"/api/v1/courses/{course.id}/progress-chart"
    first: Response = await client.get(url, params={"period_offset": 5, "period_limit": 1, "student_limit": 1}, headers=ChartFixture.headers(test_admin))
    second: Response = await client.get(url, params={"period_offset": 5, "period_limit": 1, "student_limit": 1, "student_offset": 1}, headers=ChartFixture.headers(test_admin))
    assert first.status_code == second.status_code == 200
    assert first.json()["periods"] == [{"id": journals[0].id, "period_label": "P0"}]
    assert first.json()["class_avg_series"] == second.json()["class_avg_series"] == [50.0, 50.0]
    assert first.json()["datasets"][0]["student_id"] == test_student.id
    assert second.json()["datasets"][0]["student_id"] == peer.id
    own: Response = await client.get(url, params={"period_offset": 5, "period_limit": 1}, headers=ChartFixture.headers(test_student))
    assert own.json()["my_rank"] == 2
    assert own.json()["my_series"] == [0.0, 0.0]
    empty: Response = await client.get(url, params={"period_offset": 5, "period_limit": 1, "student_offset": 2, "student_limit": 1}, headers=ChartFixture.headers(test_admin))
    assert empty.status_code == 200 and empty.json()["datasets"] == []
    assert empty.json()["class_avg_series"] == [50.0, 50.0]
    assert empty.json()["students_total"] == 2
