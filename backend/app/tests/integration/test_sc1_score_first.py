from datetime import date, time
from unittest.mock import Mock

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoring import ScoringPolicy
from app.models.course import CourseExamType
from app.models.course_schedule import CourseSchedule
from app.models.journal import Journal
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.services.journal_service import get_lesson_dates
from scripts.report_over_limit_bonuses import OverLimitBonus, OverLimitBonusReport
from app.tests.factories import auth_headers


@pytest.fixture(autouse=True)
def historical_course_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.finance_service.get_dushanbe_today", Mock(return_value=date(2026, 9, 29)))
    monkeypatch.setattr("app.core.school_calendar.SchoolCalendar.today", Mock(return_value=date(2026, 9, 29)))


def schedule_on(weekdays: list[int]) -> list[CourseSchedule]:
    return [
        CourseSchedule(day_of_week=weekday, time_start=time(18, 0), time_end=time(20, 0))
        for weekday in weekdays
    ]


class TestScoringPolicyFormula:
    @pytest.mark.parametrize(
        ("weekdays", "period_start", "period_end", "expected_lessons"),
        [
            ([0, 1, 2, 3, 4], date(2026, 8, 3), date(2026, 8, 9), 5),
            ([0, 2], date(2026, 8, 3), date(2026, 8, 9), 2),
            ([0], date(2026, 8, 1), date(2026, 8, 31), 5),
            ([1, 3], date(2026, 9, 1), date(2026, 9, 30), 9),
        ],
        ids=["daily-week", "weekly-two-days-week", "monthly-one-day-month", "monthly-two-days-month"],
    )
    def test_only_scheduled_days_count_and_maximum_includes_every_component(
        self, weekdays: list[int], period_start: date, period_end: date, expected_lessons: int
    ) -> None:
        lesson_dates: list[date] = get_lesson_dates(period_start, period_end, schedule_on(weekdays))
        assert len(lesson_dates) == expected_lessons
        maximum: int = ScoringPolicy.max_period_score(len(lesson_dates), 70, 20)
        assert maximum == expected_lessons * 5 + expected_lessons * 1 + 70 + 20

    def test_unscheduled_and_cancelled_days_contribute_nothing(self) -> None:
        all_days: list[date] = get_lesson_dates(date(2026, 8, 3), date(2026, 8, 9), schedule_on([0, 1, 2, 3, 4]))
        without_cancelled: list[date] = [lesson for lesson in all_days if lesson != date(2026, 8, 5)]
        assert ScoringPolicy.max_period_score(len(without_cancelled), 70, 20) == (
            ScoringPolicy.max_period_score(len(all_days), 70, 20) - 6
        )

    @pytest.mark.parametrize("lessons", [0, 1, 5, 12])
    @pytest.mark.parametrize("exam_maximum", [0, 60, 70, 100])
    @pytest.mark.parametrize("bonus_maximum", [0, 20, 100])
    def test_full_marks_equal_the_maximum_and_total_can_never_exceed_it(
        self, lessons: int, exam_maximum: int, bonus_maximum: int
    ) -> None:
        homework_total: int = lessons * ScoringPolicy.MAX_HOMEWORK_SCORE_PER_LESSON
        attendance_total: int = lessons * ScoringPolicy.ATTENDANCE_POINT_PER_LESSON
        best_possible_total: int = homework_total + attendance_total + exam_maximum + bonus_maximum
        assert ScoringPolicy.max_period_score(lessons, exam_maximum, bonus_maximum) == best_possible_total
        assert ScoringPolicy.percentage(best_possible_total, best_possible_total) in (0.0, 100.0)

    def test_missing_bonus_maximum_uses_the_default_of_twenty(self) -> None:
        assert ScoringPolicy.resolve_bonus_max_score(None) == 20
        assert ScoringPolicy.max_period_score(1, 70, None) == ScoringPolicy.max_period_score(1, 70, 20) == 96

    def test_exam_defaults_per_course_type(self) -> None:
        assert ScoringPolicy.default_exam_max_score(CourseExamType.WEEKLY) == 70
        assert ScoringPolicy.default_exam_max_score(CourseExamType.MONTHLY) == 60


async def create_course(client: AsyncClient, admin_headers: dict[str, str], mentor_id: int) -> int:
    response = await client.post(
        "/api/v1/courses/",
        json={
            "title": "Score first course",
            "description": "Scoring fixture course",
            "start_date": "2026-08-01",
            "end_date": "2026-09-30",
            "exam_type": "weekly",
            "price": "300.00",
            "mentor_id": mentor_id,
            "schedules": [
                {"day_of_week": 0, "time_start": "18:00:00", "time_end": "20:00:00"},
                {"day_of_week": 2, "time_start": "18:00:00", "time_end": "20:00:00"},
            ],
        },
        headers=admin_headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


async def enroll_and_first_journal(
    client: AsyncClient,
    db_session: AsyncSession,
    admin: User,
    mentor: User,
    student: User,
) -> tuple[int, int]:
    course_id: int = await create_course(client, auth_headers(admin), mentor.id)
    enrollment = await client.post(
        "/api/v1/enrollments/",
        json={"student_id": student.id, "course_id": course_id},
        headers=auth_headers(admin),
    )
    assert enrollment.status_code == 201
    async with db_session.begin():
        journals = list((await db_session.execute(select(Journal).filter(Journal.course_id == course_id))).scalars().all())
    first_journal: Journal = sorted(journals, key=lambda journal: journal.period_start)[0]
    return course_id, first_journal.id


@pytest.mark.asyncio
async def test_full_marks_reach_exactly_the_maximum_and_one_more_bonus_point_is_rejected(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    entries = grid["students"][0]["entries"]
    batch = await client.put(
        f"/api/v1/journals/{journal_id}/entries",
        json=[
            {
                "student_id": test_student.id,
                "lesson_date": entry["lesson_date"],
                "attendance": True,
                "score": 5,
                "comment": None,
                "version": entry["version"],
            }
            for entry in entries
        ],
        headers=mentor_headers,
    )
    assert batch.status_code == 200
    summary = batch.json()["summaries"][0]
    assert summary["max_period_score"] == len(entries) * 6 + grid["exam_max_score"] + grid["bonus_max_score"]

    full = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": grid["exam_max_score"],
            "bonus_score": grid["bonus_max_score"],
            "version": summary["version"],
        },
        headers=mentor_headers,
    )
    assert full.status_code == 200
    body = full.json()
    assert body["sum_score"] == body["max_period_score"]
    assert body["percentage"] == 100.0

    over = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={
            "exam_score": grid["exam_max_score"],
            "bonus_score": grid["bonus_max_score"] + 1,
            "version": body["version"],
        },
        headers=mentor_headers,
    )
    assert over.status_code == 422
    assert over.json()["detail"]["code"] == "bonus_exceeds_maximum"
    assert over.json()["detail"]["maximum"] == grid["bonus_max_score"]


@pytest.mark.asyncio
async def test_exam_over_limit_is_422_with_code_and_stores_nothing(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    grid = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    version: int = grid["students"][0]["summary"]["version"]
    response = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": grid["exam_max_score"] + 1, "bonus_score": 0, "version": version},
        headers=mentor_headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "exam_exceeds_maximum"
    after = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    assert after["students"][0]["summary"]["exam_score"] == 0
    assert after["students"][0]["summary"]["version"] == version


@pytest.mark.asyncio
async def test_bonus_maximum_setting_updates_journal_and_recomputes_every_summary(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    before = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    assert before["bonus_max_score"] == 20
    before_maximum: int = before["students"][0]["summary"]["max_period_score"]

    response = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score",
        json={"bonus_max_score": 35},
        headers=mentor_headers,
    )
    assert response.status_code == 200
    assert response.json()["journal"]["bonus_max_score"] == 35
    assert response.json()["journal"]["exam_max_score"] == before["exam_max_score"]
    assert response.json()["summaries"][0]["max_period_score"] == before_maximum + 15

    accepted = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 0, "bonus_score": 35, "version": response.json()["summaries"][0]["version"]},
        headers=mentor_headers,
    )
    assert accepted.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [{}, {"bonus_max_score": 101}, {"bonus_max_score": -1}, {"bonus_max_score": 10, "unexpected": 1}],
    ids=["empty", "above-hundred", "negative", "extra-field"],
)
async def test_bonus_maximum_payload_is_validated(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User,
    payload: dict[str, int],
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    response = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score", json=payload, headers=auth_headers(test_mentor)
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_lowering_bonus_maximum_below_a_stored_bonus_is_refused(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    version: int = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()["students"][0]["summary"]["version"]
    stored = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 0, "bonus_score": 15, "version": version},
        headers=mentor_headers,
    )
    assert stored.status_code == 200
    lowered = await client.patch(
        f"/api/v1/journals/{journal_id}/exam-max-score", json={"bonus_max_score": 10}, headers=mentor_headers
    )
    assert lowered.status_code == 400
    journal_after = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()
    assert journal_after["bonus_max_score"] == 20


@pytest.mark.asyncio
async def test_over_limit_bonus_is_kept_listed_and_does_not_block_an_exam_edit(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    _, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    async with db_session.begin():
        await db_session.execute(
            update(JournalStudentSummary)
            .where(JournalStudentSummary.journal_id == journal_id)
            .values(bonus_score=50)
        )
    async with db_session.begin():
        rows: list[OverLimitBonus] = await OverLimitBonusReport(db_session).collect()
    assert [(row.journal_id, row.student_id, row.bonus_score, row.bonus_max_score) for row in rows] == [
        (journal_id, test_student.id, 50, 20)
    ]
    assert "1 summaries over the limit (not modified)." in OverLimitBonusReport.render(rows)

    version: int = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()["students"][0]["summary"]["version"]
    edit = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 10, "bonus_score": 50, "version": version},
        headers=mentor_headers,
    )
    assert edit.status_code == 200
    assert edit.json()["bonus_score"] == 50
    raised = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 10, "bonus_score": 51, "version": edit.json()["version"]},
        headers=mentor_headers,
    )
    assert raised.status_code == 422


@pytest.mark.asyncio
async def test_report_is_empty_when_no_bonus_exceeds_its_maximum(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    async with db_session.begin():
        rows: list[OverLimitBonus] = await OverLimitBonusReport(db_session).collect()
    assert rows == []
    assert OverLimitBonusReport.render(rows) == "No summaries have a bonus above the journal bonus maximum."


@pytest.mark.asyncio
async def test_percentage_only_responses_carry_score_siblings(
    client: AsyncClient, db_session: AsyncSession, test_admin: User, test_mentor: User, test_student: User
) -> None:
    course_id, journal_id = await enroll_and_first_journal(client, db_session, test_admin, test_mentor, test_student)
    mentor_headers: dict[str, str] = auth_headers(test_mentor)
    version: int = (await client.get(f"/api/v1/journals/{journal_id}", headers=mentor_headers)).json()["students"][0]["summary"]["version"]
    saved = await client.patch(
        f"/api/v1/journals/{journal_id}/students/{test_student.id}/summary",
        json={"exam_score": 40, "bonus_score": 10, "version": version},
        headers=mentor_headers,
    )
    assert saved.status_code == 200
    stored_maximum: int = saved.json()["max_period_score"]

    journals = (await client.get(f"/api/v1/courses/{course_id}/journals", headers=mentor_headers)).json()
    first = next(journal for journal in journals if journal["id"] == journal_id)
    assert first["avg_score"] == 50.0
    assert first["bonus_max_score"] == 20
    assert first["avg_percentage"] == round(50 * 100.0 / stored_maximum, 1)

    metrics = (await client.get(f"/api/v1/courses/{course_id}/journal-metrics", headers=mentor_headers)).json()
    assert metrics["class_avg_score"] > 0
    assert metrics["class_avg_max_score"] >= stored_maximum

    student_class = (await client.get(f"/api/v1/journals/{journal_id}/class", headers=auth_headers(test_student))).json()
    assert student_class["class_avg_score"] == 50.0
    assert student_class["bonus_max_score"] == 20

    profile = (await client.get("/api/v1/students/me/profile", headers=auth_headers(test_student))).json()
    assert profile["totals"]["total_score"] >= 50
    assert profile["totals"]["total_max_score"] >= stored_maximum
    course_row = profile["courses"][0]
    assert course_row["my_total_score"] >= 50
    assert course_row["my_total_max_score"] >= stored_maximum
    assert course_row["class_avg_score"] >= 50.0
    assert profile["performance"]["total_score"] == profile["totals"]["total_score"]
    assert course_row["performance"]["total_score"] == course_row["my_total_score"]
