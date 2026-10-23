from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.journal_student_summary import JournalStudentSummary
from app.models.user import User
from app.services.journal_query_service import JournalQueryService
from app.services.sum_calculation_service import SumCalculationService
from scripts.demo_gradebook_scorer import DemoGradebookScorer
from uat_u04_support import CellPayload, JournalWorld, JournalWorldBuilder, world, world_journal


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
