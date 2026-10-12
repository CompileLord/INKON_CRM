from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
import pytest
from app.services.schedule_service import (
    LessonScheduleService,
    ScheduleRuleDTO,
)


def create_schedule(day_of_week: int, time_start: time, time_end: time) -> ScheduleRuleDTO:
    return ScheduleRuleDTO(day_of_week=day_of_week, time_start=time_start, time_end=time_end)


def test_before_course_start_seeks_first_eligible_from_start_date() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 5, 1, 10, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(9, 0), time(10, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 1)
    assert next_lesson.time() == time(9, 0)
    assert next_lesson.tzinfo == tz


def test_first_day_inclusive() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 8, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(9, 0), time(10, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 1)
    assert next_lesson.time() == time(9, 0)


def test_last_day_inclusive() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 8, 31, 8, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(9, 0), time(10, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 8, 31)
    assert next_lesson.time() == time(9, 0)


def test_after_course_end_returns_none() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 9, 1, 10, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(9, 0), time(10, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is None


def test_same_day_future_returns_today_lesson() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 8, 30, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(10, 0), time(11, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 1)
    assert next_lesson.time() == time(10, 0)


def test_same_day_passed_skips_to_next_occurrence() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 11, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(10, 0), time(11, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 8)
    assert next_lesson.time() == time(10, 0)


def test_same_day_exact_now_is_not_future() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 10, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    monday_schedule = [create_schedule(0, time(10, 0), time(11, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 8)
    assert next_lesson.time() == time(10, 0)


def test_empty_schedules_returns_none() -> None:
    service = LessonScheduleService()
    next_lesson = service.calculate_next_lesson_at(
        start_date=date(2026, 6, 1),
        end_date=date(2026, 8, 31),
        is_active=True,
        schedules=[],
    )
    assert next_lesson is None


def test_weekday_rollover() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 4, 15, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 8, 31)
    schedules = [
        create_schedule(0, time(10, 0), time(11, 30)),
        create_schedule(2, time(10, 0), time(11, 30)),
    ]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=schedules,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 6, 8)
    assert next_lesson.time() == time(10, 0)


def test_long_future_start_bounded_search() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 1, 1, 12, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    start_date = date(2028, 9, 1)
    end_date = date(2028, 12, 31)
    schedules = [create_schedule(4, time(14, 0), time(15, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=schedules,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2028, 9, 1)
    assert next_lesson.time() == time(14, 0)


def test_archived_or_inactive_course_returns_none() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_clock = datetime(2026, 6, 1, 8, 0, 0, tzinfo=tz)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_clock)

    next_lesson = service.calculate_next_lesson_at(
        start_date=date(2026, 6, 1),
        end_date=date(2026, 8, 31),
        is_active=False,
        schedules=[create_schedule(0, time(9, 0), time(10, 30))],
    )

    assert next_lesson is None


def test_server_browser_timezone_midnight_utc_boundary() -> None:
    tz_dushanbe = ZoneInfo("Asia/Dushanbe")
    clock_utc = datetime(2026, 10, 11, 20, 30, 0, tzinfo=timezone.utc)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: clock_utc)

    start_date = date(2026, 10, 1)
    end_date = date(2026, 10, 31)
    monday_schedule = [create_schedule(0, time(9, 0), time(10, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson.date() == date(2026, 10, 12)
    assert next_lesson.time() == time(9, 0)
    assert next_lesson.tzinfo == tz_dushanbe


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


def test_single_day_course_start_and_end_date_monday() -> None:
    tz = ZoneInfo("Asia/Dushanbe")
    fixed_utc = datetime(2026, 5, 31, 20, 30, 0, tzinfo=timezone.utc)
    service = LessonScheduleService(timezone_name="Asia/Dushanbe", clock=lambda: fixed_utc)

    start_date = date(2026, 6, 1)
    end_date = date(2026, 6, 1)
    monday_schedule = [create_schedule(0, time(2, 0), time(3, 30))]

    next_lesson = service.calculate_next_lesson_at(
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        schedules=monday_schedule,
    )

    assert next_lesson is not None
    assert next_lesson == datetime(2026, 6, 1, 2, 0, 0, tzinfo=tz)
