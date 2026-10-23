from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.repositories.sqlalchemy.student_performance_repository import SQLAlchemyStudentPerformanceRepository
from app.services.journal_query_service import JournalQueryService
from uat_u04_support import CellPayload, JournalWorld, JournalWorldBuilder, world


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
    async def test_unstarted_journal_future_entries_do_not_skew_totals(self, db_session: AsyncSession, world: JournalWorld) -> None:
        today: date = SchoolCalendar.today()
        entries: list[JournalEntry] = list((await db_session.execute(
            select(JournalEntry).where(JournalEntry.student_id == world.student.id)
        )).scalars().all())
        entry: JournalEntry
        for entry in entries:
            entry.attendance = entry.lesson_date <= today
        summary: JournalStudentSummary = (await db_session.execute(
            select(JournalStudentSummary).where(JournalStudentSummary.student_id == world.student.id)
        )).scalar_one()
        summary.attendance_count = len(world.past_dates)
        summary.total_lessons = len(world.past_dates) + len(world.future_dates)
        later: Journal = Journal(
            course_id=world.course.id, period_label="later", period_start=today + timedelta(days=10),
            period_end=today + timedelta(days=16), period_type="week",
        )
        db_session.add(later)
        await db_session.flush()
        db_session.add(JournalEntry(
            journal_id=later.id, student_id=world.student.id, lesson_date=today + timedelta(days=10),
            attendance=True, score=0, is_graded=False,
        ))
        db_session.add(JournalStudentSummary(
            journal_id=later.id, student_id=world.student.id, homework_score=0, attendance_score=0,
            exam_score=0, bonus_score=0, sum_score=0, max_period_score=100,
            attendance_count=1, total_lessons=1, is_graded=True,
        ))
        await db_session.commit()
        stats: dict[str, Any] = await SQLAlchemyStudentPerformanceRepository(db_session).get_student_profile_stats(world.student.id)
        assert stats["totals"]["total_lessons"] == len(world.past_dates)
        assert stats["totals"]["absences"] == 0
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
