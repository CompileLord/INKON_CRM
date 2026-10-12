from datetime import datetime
from typing import Any, Dict, Optional, Sequence
from app.models.course import CourseStatus
from app.repositories.interfaces.user_repository import UserRepository
from app.schemas.schedule import CourseScheduleTargetProtocol, ScheduleRuleProtocol
from app.services.schedule_service import LessonScheduleService


class StudentProfileService:
    def __init__(
        self,
        user_repo: UserRepository,
        schedule_service: Optional[LessonScheduleService] = None,
    ) -> None:
        self.user_repo = user_repo
        self.schedule_service = schedule_service or LessonScheduleService()

    async def get_student_profile_payload(
        self,
        student_id: int,
        current_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        snapshot_time = current_time if current_time is not None else self.schedule_service.get_current_time()
        stats = await self.user_repo.get_student_profile_stats(student_id)
        courses = stats.get("courses", [])
        for course_entry in courses:
            course: Optional[CourseScheduleTargetProtocol] = course_entry.get("course")
            schedules: Sequence[ScheduleRuleProtocol] = course_entry.pop("schedules", [])
            enrollment_status = course_entry.get("enrollment_status")
            bucket = course_entry.get("bucket")

            is_active = (
                bucket == "active"
                and enrollment_status == "active"
                and course is not None
                and course.status == CourseStatus.ACTIVE
                and not course.is_deleted
            )

            if course is not None:
                course_entry["next_lesson_at"] = self.schedule_service.calculate_next_lesson_at(
                    start_date=course.start_date,
                    end_date=course.end_date,
                    is_active=is_active,
                    schedules=schedules,
                    current_time=snapshot_time,
                )
            else:
                course_entry["next_lesson_at"] = None

        return stats
