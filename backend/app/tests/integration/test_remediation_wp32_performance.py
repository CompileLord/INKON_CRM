import json
import math
import os
import resource
import statistics
import time
from datetime import date
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import event, insert, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.charge import Charge
from app.models.course import Course, CourseExamType, CourseStatus
from app.models.enrollment import Enrollment, EnrollmentStatus
from app.models.notification_log import NotificationLog
from app.models.user import User, UserRole
from app.tests.conftest import test_engine
from app.tests.integration.wp32_reminder_support import ReminderFixture
from app.workers import tasks


class ReminderPerformanceProbe:
    def __init__(self) -> None:
        self.sql_count: int = 0
        self.cursor_rows: int = 0

    def capture(
        self, connection: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool
    ) -> None:
        self.sql_count += 1
        self.cursor_rows += max(0, cursor.rowcount)

    @classmethod
    def rss_kib(cls) -> int:
        with open("/proc/self/statm", encoding="ascii") as stream:
            resident_pages: int = int(stream.read().split()[1])
        return resident_pages * os.sysconf("SC_PAGE_SIZE") // 1024

    @classmethod
    async def seed(cls, session: AsyncSession, mentor: User, count: int) -> None:
        users: list[dict[str, Any]] = [
            {
                "email": f"performance-{index}@example.test",
                "first_name": "Performance",
                "last_name": str(index),
                "role": UserRole.STUDENT,
                "must_set_password": False,
                "parent_telegram_chat_id": 800000 + index,
                "payment_day_of_month": 22,
            }
            for index in range(count)
        ]
        user_ids: list[int] = list((await session.execute(insert(User).returning(User.id), users)).scalars())
        course: Course = Course(
            title="Measured course",
            description="Synthetic",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 12, 1),
            price=Decimal("100.00"),
            exam_type=CourseExamType.WEEKLY,
            mentor_id=mentor.id,
            status=CourseStatus.ACTIVE,
        )
        session.add(course)
        await session.flush()
        enrollments: list[dict[str, Any]] = [
            {
                "student_id": student_id,
                "course_id": course.id,
                "price_at_enrollment": Decimal("100.00"),
                "color_hex": "#0000FF",
                "status": EnrollmentStatus.ACTIVE,
            }
            for student_id in user_ids
        ]
        enrollment_rows: list[tuple[int, int]] = [
            (row[0], row[1])
            for row in (
                await session.execute(insert(Enrollment).returning(Enrollment.id, Enrollment.student_id), enrollments)
            ).all()
        ]
        charges: list[dict[str, Any]] = [
            {
                "student_id": student_id,
                "enrollment_id": enrollment_id,
                "sequence_no": 1,
                "amount": Decimal("100.00"),
                "due_date": date(2026, 10, 22),
            }
            for enrollment_id, student_id in enrollment_rows
        ]
        await session.execute(insert(Charge), charges)
        await session.commit()
        session.expunge_all()


@pytest.mark.asyncio
@pytest.mark.parametrize("enrollment_count", [10, 100, 1000])
async def test_reminder_batch_queries_and_rss_measured(
    db_session: AsyncSession, test_mentor: User, monkeypatch: pytest.MonkeyPatch, enrollment_count: int
) -> None:
    await ReminderPerformanceProbe.seed(db_session, test_mentor, enrollment_count)
    ReminderFixture.clock(monkeypatch)
    trials: list[dict[str, Any]] = []
    trial: int
    for trial in range(3):
        await db_session.execute(NotificationLog.__table__.delete())
        await db_session.commit()
        enqueue: AsyncMock = AsyncMock()
        monkeypatch.setattr("app.core.redis.enqueue_job", enqueue)
        probe: ReminderPerformanceProbe = ReminderPerformanceProbe()
        before_rss: int = probe.rss_kib()
        started: float = time.perf_counter()
        event.listen(test_engine.sync_engine, "after_cursor_execute", probe.capture)
        try:
            await tasks.check_payment_reminders({})
        finally:
            event.remove(test_engine.sync_engine, "after_cursor_execute", probe.capture)
        elapsed_ms: float = (time.perf_counter() - started) * 1000
        after_rss: int = probe.rss_kib()
        trials.append(
            {
                "trial": trial,
                "condition": "first" if trial == 0 else "warm",
                "sql_count": probe.sql_count,
                "cursor_rows": probe.cursor_rows,
                "enqueued_rows": enqueue.await_count,
                "elapsed_ms": elapsed_ms,
                "rss_before_kib": before_rss,
                "rss_after_kib": after_rss,
                "rss_delta_kib": after_rss - before_rss,
                "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            }
        )
        assert enqueue.await_count == enrollment_count
    durations: list[float] = [record["elapsed_ms"] for record in trials]
    print(
        "WP32_PERFORMANCE "
        + json.dumps(
            {
                "enrollments": enrollment_count,
                "concurrency": 1,
                "batch_size": 100,
                "trials": trials,
                "elapsed_mean_ms": statistics.mean(durations),
                "elapsed_stdev_ms": statistics.stdev(durations),
            },
            sort_keys=True,
        )
    )
    maximum_statements: int = 2 * math.ceil(enrollment_count / 100) + 1
    assert all(record["sql_count"] <= maximum_statements for record in trials)
