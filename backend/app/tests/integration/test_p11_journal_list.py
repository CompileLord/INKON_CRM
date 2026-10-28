from datetime import date, time, timedelta
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.school_calendar import SchoolCalendar
from app.core.security import create_access_token
from app.models.course_schedule import CourseSchedule
from app.models.enrollment import Enrollment
from app.models.journal import Journal, JournalPeriodType
from app.models.journal_entry import JournalEntry
from app.models.user import User
from app.tests.conftest import test_engine
from app.tests.integration.test_p7_targets import make_enrollment


@pytest.mark.asyncio
async def test_course_list_journal_progress_and_bounded_queries(
    client: AsyncClient, db_session: AsyncSession, test_student: User, test_mentor: User, test_admin: User,
) -> None:
    today: date = SchoolCalendar.today()
    enrollment: Enrollment = await make_enrollment(db_session, test_student, test_mentor, "Progress")
    await make_enrollment(db_session, test_student, test_mentor, "Empty")
    journal: Journal = Journal(course_id=enrollment.course_id, period_label="Месяц 3", period_start=today - timedelta(days=7), period_end=today + timedelta(days=7), period_type=JournalPeriodType.MONTH)
    db_session.add(journal)
    db_session.add(CourseSchedule(course_id=enrollment.course_id, day_of_week=today.weekday(), time_start=time(9), time_end=time(10)))
    await db_session.flush()
    db_session.add(JournalEntry(journal_id=journal.id, student_id=test_student.id, lesson_date=today - timedelta(days=7), is_graded=True))
    await db_session.commit()
    headers: dict[str, str] = {"Authorization": f"Bearer {create_access_token(test_admin.id, test_admin.role)}"}
    query_count: int = 0

    def count_query(conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any) -> None:
        nonlocal query_count
        query_count += 1

    event.listen(test_engine.sync_engine, "before_cursor_execute", count_query)
    try:
        first: Response = await client.get("/api/v1/courses/?page_size=1", headers=headers)
        assert first.status_code == 200
        one_count: int = query_count
        query_count = 0
        second: Response = await client.get("/api/v1/courses/?page_size=20", headers=headers)
        assert second.status_code == 200
        assert query_count == one_count
        items: list[dict] = second.json()["items"]
        progress: dict = next(item for item in items if item["id"] == enrollment.course_id)
        assert progress["current_period_label"] == "Месяц 3"
        assert progress["last_graded_lesson_date"] == (today - timedelta(days=7)).isoformat()
        assert progress["ungraded_lessons_count"] == 1
        empty: dict = next(item for item in items if item["title"] == "Empty")
        assert empty["current_period_label"] is None
        assert empty["last_graded_lesson_date"] is None
        assert empty["ungraded_lessons_count"] == 0
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", count_query)
