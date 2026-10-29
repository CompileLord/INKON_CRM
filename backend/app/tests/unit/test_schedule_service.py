from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

import pytest

from app.services.schedule_service import LessonScheduleService, ScheduleRuleDTO


def create_schedule(day_of_week: int, time_start: time, time_end: time) -> ScheduleRuleDTO:
    return ScheduleRuleDTO(day_of_week=day_of_week, time_start=time_start, time_end=time_end)


@pytest.mark.parametrize(
    ("clock", "start", "end", "active", "schedules", "expected"),
    [
        pytest.param(datetime(2026, 5, 1, 10), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 9, 10)], datetime(2026, 6, 1, 9), id="before-start"),
        pytest.param(datetime(2026, 6, 1, 8), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 9, 10)], datetime(2026, 6, 1, 9), id="first-day"),
        pytest.param(datetime(2026, 8, 31, 8), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 9, 10)], datetime(2026, 8, 31, 9), id="last-day"),
        pytest.param(datetime(2026, 9, 1, 10), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 9, 10)], None, id="after-end"),
        pytest.param(datetime(2026, 6, 1, 8, 30), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 10, 11)], datetime(2026, 6, 1, 10), id="same-day-future"),
        pytest.param(datetime(2026, 6, 1, 11), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 10, 11)], datetime(2026, 6, 8, 10), id="same-day-passed"),
        pytest.param(datetime(2026, 6, 1, 10), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 10, 11)], datetime(2026, 6, 8, 10), id="same-day-exact"),
        pytest.param(datetime(2026, 6, 1, 8), date(2026, 6, 1), date(2026, 8, 31), True, [], None, id="empty"),
        pytest.param(datetime(2026, 6, 4, 15), date(2026, 6, 1), date(2026, 8, 31), True, [(0, 10, 11), (2, 10, 11)], datetime(2026, 6, 8, 10), id="weekday-rollover"),
        pytest.param(datetime(2026, 1, 1, 12), date(2028, 9, 1), date(2028, 12, 31), True, [(4, 14, 15)], datetime(2028, 9, 1, 14), id="long-future"),
        pytest.param(datetime(2026, 6, 1, 8), date(2026, 6, 1), date(2026, 8, 31), False, [(0, 9, 10)], None, id="inactive"),
        pytest.param(datetime(2026, 10, 11, 20, 30, tzinfo=timezone.utc), date(2026, 10, 1), date(2026, 10, 31), True, [(0, 9, 10)], datetime(2026, 10, 12, 9), id="utc-boundary"),
        pytest.param(datetime(2026, 5, 31, 20, 30, tzinfo=timezone.utc), date(2026, 6, 1), date(2026, 6, 1), True, [(0, 2, 3)], datetime(2026, 6, 1, 2), id="single-day"),
    ],
)
def test_next_lesson_cases(
    clock: datetime, start: date, end: date, active: bool,
    schedules: list[tuple[int, int, int]], expected: datetime | None,
) -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = clock if clock.tzinfo else clock.replace(tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)
    result = service.calculate_next_lesson_at(
        start_date=start, end_date=end, is_active=active,
        schedules=[create_schedule(day, time(hour), time(end_hour, 30)) for day, hour, end_hour in schedules],
    )
    assert result == (expected.replace(tzinfo=tz) if expected else None)
    if result is not None:
        assert result.tzinfo == tz


def test_multiple_eligible_courses() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 8, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    course_a_schedules = [create_schedule(1, time(10, 0), time(11, 30))]
    course_b_schedules = [create_schedule(0, time(14, 0), time(15, 30))]

    next_a = service.calculate_next_lesson_at(
        start_date=date(2026, 6, 1),
        end_date=date(2026, 8, 31),
        is_active=True,
        schedules=course_a_schedules,
    )

    next_b = service.calculate_next_lesson_at(
        start_date=date(2026, 6, 1),
        end_date=date(2026, 8, 31),
        is_active=True,
        schedules=course_b_schedules,
    )

    assert next_a is not None
    assert next_b is not None
    assert next_b < next_a
    assert next_b.date() == date(2026, 6, 1)
    assert next_a.date() == date(2026, 6, 2)
