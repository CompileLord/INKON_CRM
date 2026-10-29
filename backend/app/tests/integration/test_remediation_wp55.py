from dataclasses import replace
from datetime import date, time, timedelta
import json
import math
import os
from pathlib import Path
from statistics import mean, pstdev
from time import perf_counter
from typing import Any, TextIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import Row, delete, event, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schedule_utils import LessonDateCalculator
from app.models.course import Course, CourseStatus
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal
from app.models.journal_entry import JournalEntry
from app.models.user import User, UserRole
from app.repositories.interfaces.journal_repository import MentorJournalBatch
from app.schemas.journal import GradingQueueItemResponse, JournalResponse
from app.services.journal_query_service import JournalQueryService
from app.services.journal_service import JournalService, get_lesson_dates
from app.services.enrollment_service import EnrollmentService
from app.tests.factories import create_course, create_user, enroll_student


class TestMentorQueue:
    async def seed(self, session: AsyncSession, count: int) -> tuple[User, list[Course]]:
        mentor: User = await create_user(session, UserRole.MENTOR, first_name="Own", last_name="Mentor")
        foreign: User = await create_user(session, UserRole.MENTOR, first_name="Foreign", last_name="Mentor")
        student: User = await create_user(session, UserRole.STUDENT, first_name="Queue", last_name="Student")
        today: date = date.today()
        courses: list[Course] = []
        index: int
        label: str
        start_offset: int
        end_offset: int
        graded: int
        weekday: int
        for index in range(count + 3):
            course: Course = await create_course(
                session, foreign if index == count else mentor,
                title=f"Course {index}", description="Queue fixture",
                start_date=today - timedelta(days=60), end_date=today + timedelta(days=60),
                status=CourseStatus.ARCHIVED if index == count + 1 else CourseStatus.ACTIVE,
                is_deleted=index == count + 2,
            )
            courses.append(course)
            await enroll_student(session, student, course)
            session.add_all([CourseSchedule(course_id=course.id, day_of_week=weekday, time_start=time(9), time_end=time(10)) for weekday in range(7)])
            for label, start_offset, end_offset, graded in (
                ("empty", -2, 0, 0), ("partial", -1, 0, 1), ("complete", -1, -1, 1),
                ("upcoming", 1, 2, 1), ("past", -10, -8, 0), ("ungraded", -6, -5, 0),
            ):
                journal: Journal = Journal(course_id=course.id, period_label=label, period_start=today + timedelta(days=start_offset), period_end=today + timedelta(days=end_offset), period_type="week")
                session.add(journal)
                await session.flush()
                session.add(JournalEntry(journal_id=journal.id, student_id=student.id, lesson_date=journal.period_start, score=0, attendance=False, is_graded=bool(graded)))
        await session.flush()
        return mentor, courses[:count]

    async def legacy(self, session: AsyncSession, courses: list[Course]) -> list[GradingQueueItemResponse]:
        service: JournalQueryService = JournalQueryService(session)
        queue: list[GradingQueueItemResponse] = []
        today: date = date.today()
        course: Course
        journal: JournalResponse
        for course in courses:
            for journal in await service.get_course_journals_aggregated(course.id):
                if journal.state in ("empty", "partial") and journal.period_start <= today:
                    queue.append(GradingQueueItemResponse(journal_id=journal.id, course_id=course.id, course_title=course.title, period_label=journal.period_label, period_start=journal.period_start, period_end=journal.period_end, state=journal.state, cells_filled=journal.cells_filled, cells_expected=journal.cells_expected, is_current=journal.period_start <= today <= journal.period_end))
        queue.sort(key=lambda item: (0 if item.is_current else 1, -item.period_end.toordinal(), item.journal_id))
        return queue

    @pytest.mark.asyncio
    async def test_queue_ties_are_ordered_by_journal_id(self, db_session: AsyncSession) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await self.seed(db_session, 2)
        service: JournalQueryService = JournalQueryService(db_session)
        batch: MentorJournalBatch = await service.journal_repository.get_mentor_journal_batch(mentor.id, date.today())
        reversed_batch: MentorJournalBatch = replace(batch, courses=tuple(reversed(batch.courses)))
        with patch.object(service.journal_repository, "get_mentor_journal_batch", return_value=reversed_batch):
            actual: list[GradingQueueItemResponse] = await service.get_mentor_grading_queue(mentor.id)
        tied: list[GradingQueueItemResponse] = [item for item in actual if item.period_label == "empty"]
        assert len(tied) == 2
        assert tied[0].period_start == tied[1].period_start
        assert tied[0].period_end == tied[1].period_end
        assert tied[0].is_current == tied[1].is_current
        assert tied[0].journal_id < tied[1].journal_id
        assert actual == await self.legacy(db_session, courses)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("course_count", [1, 10, 100])
    async def test_queue_is_bounded_and_identical(self, db_session: AsyncSession, course_count: int) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await self.seed(db_session, course_count)
        expected: list[GradingQueueItemResponse] = await self.legacy(db_session, courses)
        service: JournalQueryService = JournalQueryService(db_session)
        queries: list[str] = []
        rows: list[int] = []
        durations: list[float] = []
        def capture(connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool) -> None:
            queries.append(statement)
            rows.append(cursor.rowcount)
        assert db_session.bind is not None
        event.listen(db_session.bind.sync_engine, "after_cursor_execute", capture)
        trial: int
        try:
            for trial in range(9):
                queries.clear()
                rows.clear()
                started: float = perf_counter()
                actual: list[GradingQueueItemResponse] = await service.get_mentor_grading_queue(mentor.id)
                durations.append((perf_counter() - started) * 1000)
                assert actual == expected
        finally:
            event.remove(db_session.bind.sync_engine, "after_cursor_execute", capture)
        assert len(actual) == course_count * 4
        assert {item.period_label for item in actual} == {"empty", "partial", "past", "ungraded"}
        assert actual[0].is_current
        assert {item.state for item in actual} == {"empty", "partial"}
        evidence: str | None = os.environ.get("WP55_MEASUREMENTS")
        output: TextIO
        if evidence:
            with Path(evidence).open("a") as output:
                output.write(json.dumps({
                    "courses": course_count,
                    "queries": len(queries),
                    "sql_rows": sum(rows),
                    "queue_rows": len(actual),
                    "trials_ms": durations,
                    "p95_ms": sorted(durations)[math.ceil(len(durations) * .95) - 1],
                    "mean_ms": mean(durations),
                    "stddev_ms": pstdev(durations),
                }) + "\n")
        assert len(queries) <= 5

    @pytest.mark.asyncio
    @pytest.mark.parametrize("without_students,without_schedules", [(True, False), (False, True), (True, True)])
    async def test_zero_expected_cells_remain_partial_when_graded(
        self, db_session: AsyncSession, without_students: bool, without_schedules: bool,
    ) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await self.seed(db_session, 1)
        if without_students:
            await db_session.execute(update(Enrollment).where(Enrollment.course_id == courses[0].id).values(is_deleted=True))
        if without_schedules:
            await db_session.execute(delete(CourseSchedule).where(CourseSchedule.course_id == courses[0].id))
        actual: list[GradingQueueItemResponse] = await JournalQueryService(db_session).get_mentor_grading_queue(mentor.id)
        assert actual == []

    @pytest.mark.asyncio
    async def test_nullable_grading_remains_empty(self, db_session: AsyncSession) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await self.seed(db_session, 1)
        await db_session.execute(update(JournalEntry).values(is_graded=None))
        actual: list[GradingQueueItemResponse] = await JournalQueryService(db_session).get_mentor_grading_queue(mentor.id)
        assert actual == await self.legacy(db_session, courses)
        assert len(actual) == 5
        assert all(item.cells_filled == 0 and item.state == "empty" for item in actual)

    @pytest.mark.asyncio
    async def test_no_courses(self, db_session: AsyncSession) -> None:
        assert await JournalQueryService(db_session).get_mentor_grading_queue(-1) == []


class TestJournalMutationPolicy:
    @pytest.mark.parametrize("role,own,archived,allowed", [
        (UserRole.SUPERADMIN, False, True, True),
        (UserRole.SUPERADMIN, False, False, True),
        (UserRole.MENTOR, True, False, True),
        (UserRole.MENTOR, False, False, False),
        (UserRole.MENTOR, True, True, False),
        (UserRole.MENTOR, False, True, False),
        (UserRole.STUDENT, True, False, False),
        (UserRole.ACCOUNTANT, True, False, False),
    ])
    def test_policy(self, role: UserRole, own: bool, archived: bool, allowed: bool) -> None:
        user: User = User(id=1, role=role)
        course: Course = Course(mentor_id=1 if own else 2, status=CourseStatus.ARCHIVED if archived else CourseStatus.ACTIVE)
        caught: pytest.ExceptionInfo[HTTPException]
        if allowed:
            JournalService.authorize_mutation(course, user)
        else:
            with pytest.raises(HTTPException) as caught:
                JournalService.authorize_mutation(course, user)
            assert caught.value.status_code == 403
            assert caught.value.detail == ("Cannot update archived course" if own and archived and role == UserRole.MENTOR else "Not enough permissions")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("operation", ["batch", "summary", "maximum"])
    async def test_every_mutation_uses_policy(self, db_session: AsyncSession, operation: str) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await TestMentorQueue().seed(db_session, 1)
        journal: Journal = (await db_session.execute(select(Journal).where(Journal.course_id == courses[0].id).limit(1))).scalar_one()
        service: JournalService = JournalService(db_session)
        policy: MagicMock
        with patch.object(JournalService, "authorize_mutation", side_effect=HTTPException(403, "shared policy")) as policy:
            with pytest.raises(HTTPException, match="shared policy"):
                if operation == "batch":
                    await service.batch_update_entries(journal.id, [], mentor)
                elif operation == "summary":
                    await service.update_exam_or_bonus(journal.id, 1, 0, 0, 1, mentor)
                else:
                    await service.update_exam_max_score(journal.id, None, None, mentor)
            policy.assert_called_once_with(courses[0], mentor)


class TestCanonicalLessonDates:
    @pytest.mark.parametrize("start,end,weekdays,expected", [
        (date(2026, 10, 19), date(2026, 10, 21), [0, 2, 2], [date(2026, 10, 19), date(2026, 10, 21)]),
        (date(2026, 10, 19), date(2026, 10, 19), [0], [date(2026, 10, 19)]),
        (date(2026, 10, 20), date(2026, 10, 19), [0], []),
        (date(2026, 10, 19), date(2026, 10, 21), [], []),
    ])
    def test_dates(self, start: date, end: date, weekdays: list[int], expected: list[date]) -> None:
        schedules: list[CourseSchedule] = [CourseSchedule(day_of_week=weekday) for weekday in weekdays]
        assert get_lesson_dates(start, end, schedules) == expected
        assert list(LessonDateCalculator.calculate(start, end, weekdays)) == expected
        calculate: MagicMock
        with patch.object(LessonDateCalculator, "calculate", return_value=(date(2000, 1, 1),)) as calculate:
            assert get_lesson_dates(start, end, schedules) == [date(2000, 1, 1)]
            calculate.assert_called_once()

    @pytest.mark.asyncio
    async def test_enrollment_uses_canonical_calculator(self, db_session: AsyncSession) -> None:
        mentor: User
        courses: list[Course]
        mentor, courses = await TestMentorQueue().seed(db_session, 1)
        student: User = await create_user(db_session, UserRole.STUDENT, first_name="New", last_name="Student")
        administrator: User = await create_user(db_session, UserRole.SUPERADMIN, first_name="Admin", last_name="User")
        calculate: MagicMock
        with patch.object(LessonDateCalculator, "calculate", wraps=LessonDateCalculator.calculate) as calculate:
            await EnrollmentService(db_session).enroll_student(student.id, courses[0].id, administrator)
            calculate.assert_called_once()
            assert calculate.call_args.args[:2] == (courses[0].start_date, courses[0].end_date)
        journals: list[Journal] = list((await db_session.scalars(
            select(Journal).where(Journal.course_id == courses[0].id)
        )).all())
        journal: Journal
        offset: int
        expected: set[tuple[int, date]] = {
            (journal.id, journal.period_start + timedelta(days=offset))
            for journal in journals
            for offset in range((journal.period_end - journal.period_start).days + 1)
        }
        row: Row
        actual: set[tuple[int, date]] = {
            (row[0], row[1]) for row in (await db_session.execute(
                select(JournalEntry.journal_id, JournalEntry.lesson_date).where(JournalEntry.student_id == student.id)
            )).all()
        }
        assert actual == expected
