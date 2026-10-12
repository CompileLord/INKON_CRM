from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any, List
from zoneinfo import ZoneInfo
from app.models.course import CourseStatus
from app.services.schedule_service import LessonScheduleService, ScheduleRuleDTO
from app.services.student_profile_service import StudentProfileService
import pytest


@dataclass(frozen=True)
class ProfileCourseFixture:
    id: int
    start_date: date
    end_date: date
    status: CourseStatus = CourseStatus.ACTIVE
    is_deleted: bool = False


class ProfileRepositoryFixture:
    async def get_student_profile_stats(self, student_id: int) -> dict:
        return {"courses": [
            {"course": ProfileCourseFixture(identifier, date(2026, 6, 1), date(2026, 6, 30)),
             "bucket": "active", "enrollment_status": "active",
             "schedules": [ScheduleRuleDTO(0, time(9), time(10))]}
            for identifier in [1, 2]
        ]}


class MatrixProfileRepositoryFixture:
    def __init__(self, courses_payload: List[dict]) -> None:
        self.courses_payload = courses_payload

    async def get_student_profile_stats(self, student_id: int) -> dict:
        return {"courses": self.courses_payload}


@pytest.mark.asyncio
async def test_one_profile_response_uses_one_schedule_clock_snapshot() -> None:
    clock_calls: list[int] = []

    def advancing_clock() -> datetime:
        clock_calls.append(1)
        return datetime(2026, 6, 1, 8 if len(clock_calls) == 1 else 10, tzinfo=ZoneInfo("Asia/Dushanbe"))

    service = StudentProfileService(ProfileRepositoryFixture(), LessonScheduleService(clock=advancing_clock))
    result = await service.get_student_profile_payload(1)
    assert len(clock_calls) == 1
    assert result["courses"][0]["next_lesson_at"] == result["courses"][1]["next_lesson_at"]
    assert result["courses"][0]["next_lesson_at"] == datetime(2026, 6, 1, 9, tzinfo=ZoneInfo("Asia/Dushanbe"))


@pytest.mark.asyncio
async def test_student_profile_service_eligibility_matrix() -> None:
    fixed_now = datetime(2026, 6, 1, 8, 0, 0, tzinfo=ZoneInfo("Asia/Dushanbe"))
    schedule = [ScheduleRuleDTO(0, time(9), time(10))]

    fixtures = [
        {
            "name": "active_eligible",
            "course": ProfileCourseFixture(1, date(2026, 6, 1), date(2026, 6, 30), CourseStatus.ACTIVE, False),
            "bucket": "active",
            "enrollment_status": "active",
            "schedules": schedule,
            "expected_next": datetime(2026, 6, 1, 9, tzinfo=ZoneInfo("Asia/Dushanbe")),
            "expected_bucket": "active",
        },
        {
            "name": "archived_course",
            "course": ProfileCourseFixture(2, date(2026, 6, 1), date(2026, 6, 30), CourseStatus.ARCHIVED, False),
            "bucket": "archive",
            "enrollment_status": "active",
            "schedules": schedule,
            "expected_next": None,
            "expected_bucket": "archive",
        },
        {
            "name": "inactive_enrollment",
            "course": ProfileCourseFixture(3, date(2026, 6, 1), date(2026, 6, 30), CourseStatus.ACTIVE, False),
            "bucket": "archive",
            "enrollment_status": "dropped",
            "schedules": schedule,
            "expected_next": None,
            "expected_bucket": "archive",
        },
        {
            "name": "no_schedules",
            "course": ProfileCourseFixture(4, date(2026, 6, 1), date(2026, 6, 30), CourseStatus.ACTIVE, False),
            "bucket": "active",
            "enrollment_status": "active",
            "schedules": [],
            "expected_next": None,
            "expected_bucket": "active",
        },
        {
            "name": "deleted_course",
            "course": ProfileCourseFixture(5, date(2026, 6, 1), date(2026, 6, 30), CourseStatus.ACTIVE, True),
            "bucket": "active",
            "enrollment_status": "active",
            "schedules": schedule,
            "expected_next": None,
            "expected_bucket": "active",
        },
        {
            "name": "active_dated_expired",
            "course": ProfileCourseFixture(6, date(2025, 1, 1), date(2025, 5, 1), CourseStatus.ACTIVE, False),
            "bucket": "active",
            "enrollment_status": "active",
            "schedules": schedule,
            "expected_next": None,
            "expected_bucket": "active",
        },
    ]

    repo = MatrixProfileRepositoryFixture([
        {
            "course": f["course"],
            "bucket": f["bucket"],
            "enrollment_status": f["enrollment_status"],
            "schedules": list(f["schedules"]),
        }
        for f in fixtures
    ])

    service = StudentProfileService(repo, LessonScheduleService(clock=lambda: fixed_now))
    result = await service.get_student_profile_payload(1)

    for idx, f in enumerate(fixtures):
        course_result = result["courses"][idx]
        assert course_result["next_lesson_at"] == f["expected_next"]
        assert course_result["bucket"] == f["expected_bucket"]
        assert "schedules" not in course_result
