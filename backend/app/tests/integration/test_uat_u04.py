from dataclasses import dataclass
from datetime import date, time, timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.core.security import create_access_token
from app.models.course import Course
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User, UserRole
from app.repositories.sqlalchemy.student_performance_repository import SQLAlchemyStudentPerformanceRepository
from app.services.journal_query_service import JournalQueryService
from app.services.sum_calculation_service import SumCalculationService
from scripts.demo_gradebook_scorer import DemoGradebookScorer


@dataclass
class JournalWorld:
    mentor: User
    admin: User
    student: User
    other_student: User
    outsider: User
    course: Course
    journal: Journal
    past_dates: list[date]
    future_dates: list[date]
    skipped_date: date


class JournalWorldBuilder:
    @staticmethod
    def headers(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    @staticmethod
    async def build(session: AsyncSession, mentor: User, admin: User, student: User) -> JournalWorld:
        today: date = SchoolCalendar.today()
        other_student: User = User(first_name="Other", last_name="Student", role=UserRole.STUDENT, email="other-u04@example.com")
        outsider: User = User(first_name="Out", last_name="Sider", role=UserRole.STUDENT, email="outsider-u04@example.com")
        session.add_all([other_student, outsider])
        await session.flush()
        skipped_date: date = today - timedelta(days=1)
        course: Course = Course(
            title="U04 course", description="U04", mentor_id=mentor.id,
            start_date=today - timedelta(days=4), end_date=today + timedelta(days=3),
            exam_type="weekly", price=Decimal("100.00"),
        )
        session.add(course)
        await session.flush()
        weekday: int
        session.add_all([
            CourseSchedule(course_id=course.id, day_of_week=weekday, time_start=time(9), time_end=time(10))
            for weekday in range(7) if weekday != skipped_date.weekday()
        ])
        journal: Journal = Journal(
            course_id=course.id, period_label="U04", period_start=today - timedelta(days=4),
            period_end=today + timedelta(days=3), period_type="week",
        )
        session.add(journal)
        await session.flush()
        offsets: list[int] = [-4, -3, -2, 0, 1, 2, 3]
        past_dates: list[date] = [today + timedelta(days=offset) for offset in offsets if offset <= 0]
        future_dates: list[date] = [today + timedelta(days=offset) for offset in offsets if offset > 0]
        enrolled: User
        for enrolled in (student, other_student):
            session.add(Enrollment(student_id=enrolled.id, course_id=course.id, price_at_enrollment=Decimal("100.00"), color_hex="#123456"))
            lesson_date: date
            for lesson_date in past_dates + future_dates:
                session.add(JournalEntry(
                    journal_id=journal.id, student_id=enrolled.id, lesson_date=lesson_date,
                    attendance=False, score=0, is_graded=False,
                ))
            session.add(JournalStudentSummary(
                journal_id=journal.id, student_id=enrolled.id, homework_score=0, attendance_score=0,
                exam_score=0, bonus_score=0, sum_score=0, max_period_score=100,
                attendance_count=0, total_lessons=len(past_dates) + len(future_dates), is_graded=True,
            ))
        await session.commit()
        return JournalWorld(mentor, admin, student, other_student, outsider, course, journal, past_dates, future_dates, skipped_date)


class CellPayload:
    @staticmethod
    def build(student_id: int, lesson_date: date, version: int = 1, score: int = 4) -> dict[str, Any]:
        return {
            "student_id": student_id, "lesson_date": lesson_date.isoformat(),
            "attendance": True, "score": score, "comment": None, "version": version,
        }


@pytest.fixture
async def world(db_session: AsyncSession, test_mentor: User, test_admin: User, test_student: User) -> JournalWorld:
    return await JournalWorldBuilder.build(db_session, test_mentor, test_admin, test_student)


@pytest.fixture
def world_journal() -> Journal:
    today: date = SchoolCalendar.today()
    return Journal(
        id=1, course_id=1, period_label="started", period_start=today - timedelta(days=3),
        period_end=today + timedelta(days=3), period_type="week", exam_max_score=70,
    )


class TestFutureLessonsRejected:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("actor", ["mentor", "admin"])
    async def test_future_cell_is_422_for_staff(self, client: AsyncClient, world: JournalWorld, actor: str) -> None:
        user: User = world.mentor if actor == "mentor" else world.admin
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.future_dates[0])],
            headers=JournalWorldBuilder.headers(user),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "future_lesson"
        assert response.json()["detail"]["cells"][0]["lesson_date"] == world.future_dates[0].isoformat()

    @pytest.mark.asyncio
    async def test_future_cell_blocks_batch_and_stores_nothing(self, client: AsyncClient, db_session: AsyncSession, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.past_dates[0]), CellPayload.build(world.student.id, world.future_dates[0])],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        stored: list[JournalEntry] = list((await db_session.execute(
            select(JournalEntry).where(JournalEntry.journal_id == world.journal.id, JournalEntry.score > 0)
        )).scalars().all())
        assert stored == []

    @pytest.mark.asyncio
    async def test_today_cell_is_accepted(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, SchoolCalendar.today())],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 200
        assert len(response.json()["applied"]) == 1


class TestInvalidCellsAre422:
    @pytest.mark.asyncio
    async def test_non_lesson_date_in_period(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.skipped_date)],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_lesson_date"

    @pytest.mark.asyncio
    async def test_date_outside_period(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.past_dates[0] - timedelta(days=14))],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_lesson_date"

    @pytest.mark.asyncio
    async def test_unknown_student(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(9999999, world.past_dates[0])],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "unknown_student"

    @pytest.mark.asyncio
    async def test_student_not_enrolled(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.outsider.id, world.past_dates[0])],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "student_not_enrolled"

    @pytest.mark.asyncio
    async def test_withdrawn_student(self, client: AsyncClient, db_session: AsyncSession, world: JournalWorld) -> None:
        enrollment: Enrollment = (await db_session.execute(
            select(Enrollment).where(Enrollment.student_id == world.other_student.id)
        )).scalar_one()
        enrollment.status = "withdrawn"
        await db_session.commit()
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.other_student.id, world.past_dates[0])],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "student_not_enrolled"

    @pytest.mark.asyncio
    async def test_real_version_conflict_stays_409(self, client: AsyncClient, world: JournalWorld) -> None:
        response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.past_dates[0], version=99)],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert response.status_code == 409


class TestCountsIgnoreFutureLessons:
    @pytest.mark.asyncio
    async def test_student_attendance_and_absences_ignore_future(self, db_session: AsyncSession, world: JournalWorld) -> None:
        entries: list[JournalEntry] = list((await db_session.execute(
            select(JournalEntry).where(JournalEntry.student_id == world.student.id)
        )).scalars().all())
        entry: JournalEntry
        for entry in entries:
            entry.attendance = entry.lesson_date <= SchoolCalendar.today()
            entry.is_graded = entry.lesson_date <= SchoolCalendar.today()
        summary: JournalStudentSummary = (await db_session.execute(
            select(JournalStudentSummary).where(JournalStudentSummary.student_id == world.student.id)
        )).scalar_one()
        summary.attendance_count = len(world.past_dates)
        summary.total_lessons = len(world.past_dates) + len(world.future_dates)
        await db_session.commit()
        stats: dict[str, Any] = await SQLAlchemyStudentPerformanceRepository(db_session).get_student_profile_stats(world.student.id)
        assert stats["totals"]["total_lessons"] == len(world.past_dates)
        assert stats["totals"]["absences"] == 0
        assert stats["totals"]["attendance_percentage"] == 100.0
        assert stats["courses"][0]["absences"] == 0
        assert stats["courses"][0]["attendance_percentage"] == 100.0

    @pytest.mark.asyncio
    async def test_expected_counts_and_state_use_held_lessons(self, db_session: AsyncSession, world: JournalWorld) -> None:
        past: set[date] = set(world.past_dates)
        entries: list[JournalEntry] = list((await db_session.execute(select(JournalEntry))).scalars().all())
        entry: JournalEntry
        for entry in entries:
            entry.is_graded = entry.lesson_date in past
        await db_session.commit()
        service: JournalQueryService = JournalQueryService(db_session)
        journals = await service.get_course_journals_aggregated(world.course.id)
        assert journals[0].cells_expected == 2 * len(world.past_dates)
        assert journals[0].cells_filled == 2 * len(world.past_dates)
        assert journals[0].state == "complete"
        queue = await service.get_mentor_grading_queue(world.mentor.id)
        assert queue == []

    @pytest.mark.asyncio
    async def test_queue_expected_ignores_future(self, db_session: AsyncSession, world: JournalWorld) -> None:
        entry: JournalEntry = (await db_session.execute(
            select(JournalEntry).where(JournalEntry.student_id == world.student.id, JournalEntry.lesson_date == world.past_dates[0])
        )).scalar_one()
        entry.is_graded = True
        await db_session.commit()
        queue = await JournalQueryService(db_session).get_mentor_grading_queue(world.mentor.id)
        assert len(queue) == 1
        assert queue[0].cells_expected == 2 * len(world.past_dates)
        assert queue[0].cells_filled == 1

    @pytest.mark.asyncio
    async def test_legacy_graded_future_entry_is_not_counted(self, db_session: AsyncSession, world: JournalWorld) -> None:
        entry: JournalEntry = (await db_session.execute(
            select(JournalEntry).where(JournalEntry.student_id == world.student.id, JournalEntry.lesson_date == world.future_dates[0])
        )).scalar_one()
        entry.is_graded = True
        await db_session.commit()
        journals = await JournalQueryService(db_session).get_course_journals_aggregated(world.course.id)
        assert journals[0].cells_filled == 0
        assert journals[0].state == "empty"


    @pytest.mark.asyncio
    async def test_queue_ignores_legacy_graded_future_entry(self, db_session: AsyncSession, world: JournalWorld) -> None:
        entry: JournalEntry = (await db_session.execute(
            select(JournalEntry).where(JournalEntry.student_id == world.student.id, JournalEntry.lesson_date == world.future_dates[0])
        )).scalar_one()
        entry.is_graded = True
        await db_session.commit()
        queue = await JournalQueryService(db_session).get_mentor_grading_queue(world.mentor.id)
        assert queue[0].cells_filled == 0
        assert queue[0].state == "empty"


class TestEntriesExposeGradedFlag:
    @pytest.mark.asyncio
    async def test_graded_zero_differs_from_not_graded(self, client: AsyncClient, world: JournalWorld) -> None:
        put_response: Response = await client.put(
            f"/api/v1/journals/{world.journal.id}/entries",
            json=[CellPayload.build(world.student.id, world.past_dates[0], score=0)],
            headers=JournalWorldBuilder.headers(world.mentor),
        )
        assert put_response.status_code == 200
        assert put_response.json()["applied"][0]["is_graded"] is True
        viewer: User
        for viewer in (world.mentor, world.admin, world.student):
            payload: dict[str, Any] = (await client.get(
                f"/api/v1/journals/{world.journal.id}", headers=JournalWorldBuilder.headers(viewer),
            )).json()
            record: dict[str, Any] = next(item for item in payload["students"] if item["student_id"] == world.student.id)
            flags: dict[str, bool] = {entry["lesson_date"]: entry["is_graded"] for entry in record["entries"]}
            assert flags[world.past_dates[0].isoformat()] is True
            assert flags[world.past_dates[1].isoformat()] is False


class TestSeedMarksScoresGraded:
    def test_scorer_marks_past_entries_only(self) -> None:
        today: date = SchoolCalendar.today()
        entries: list[JournalEntry] = [
            JournalEntry(journal_id=1, student_id=3, lesson_date=today - timedelta(days=offset), attendance=False, score=0, is_graded=False)
            for offset in (2, 1, 0, -1)
        ]
        DemoGradebookScorer.score_entries(3, entries, today)
        assert [entry.is_graded for entry in entries] == [True, True, True, False]
        assert entries[-1].score == 0

    def test_scorer_marks_started_summary_graded(self, world_journal: Journal) -> None:
        summary: JournalStudentSummary = JournalStudentSummary(
            journal_id=world_journal.id, student_id=4, homework_score=0, attendance_score=0, exam_score=0,
            bonus_score=0, sum_score=0, max_period_score=100, attendance_count=0, total_lessons=0, is_graded=False,
        )
        DemoGradebookScorer.score_summary(summary, world_journal, SchoolCalendar.today())
        assert summary.is_graded is True
        upcoming: Journal = Journal(
            course_id=1, period_label="later", period_start=SchoolCalendar.today() + timedelta(days=1),
            period_end=SchoolCalendar.today() + timedelta(days=8), period_type="week",
        )
        untouched: JournalStudentSummary = JournalStudentSummary(
            journal_id=2, student_id=4, homework_score=0, attendance_score=0, exam_score=0,
            bonus_score=0, sum_score=0, max_period_score=100, attendance_count=0, total_lessons=0, is_graded=False,
        )
        DemoGradebookScorer.score_summary(untouched, upcoming, SchoolCalendar.today())
        assert untouched.is_graded is False

    @pytest.mark.asyncio
    async def test_seeded_metrics_are_not_empty(self, db_session: AsyncSession, world: JournalWorld) -> None:
        today: date = SchoolCalendar.today()
        entries: list[JournalEntry] = list((await db_session.execute(select(JournalEntry))).scalars().all())
        for_student: dict[int, list[JournalEntry]] = {}
        entry: JournalEntry
        for entry in entries:
            entry.is_graded = False
            for_student.setdefault(entry.student_id, []).append(entry)
        summaries: list[JournalStudentSummary] = list((await db_session.execute(select(JournalStudentSummary))).scalars().all())
        summary: JournalStudentSummary
        for summary in summaries:
            summary.is_graded = False
        student_id: int
        for student_id, student_entries in for_student.items():
            DemoGradebookScorer.score_entries(student_id, student_entries, today)
        for summary in summaries:
            DemoGradebookScorer.score_summary(summary, world.journal, today)
        await db_session.flush()
        await SumCalculationService(db_session).recalculate_journal(world.journal.id)
        await db_session.commit()
        service: JournalQueryService = JournalQueryService(db_session)
        journals = await service.get_course_journals_aggregated(world.course.id)
        assert journals[0].cells_filled == 2 * len(world.past_dates)
        assert journals[0].avg_percentage is not None and journals[0].avg_percentage > 0
        metrics = await service.get_course_journal_metrics(world.course.id)
        assert metrics.class_avg_percentage > 0
        assert metrics.attendance_rate > 0
