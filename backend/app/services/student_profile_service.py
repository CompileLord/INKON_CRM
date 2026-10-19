from datetime import datetime
from typing import Any, Dict, Optional, Sequence
from app.models.course import CourseStatus
from app.repositories.interfaces.user_repository import (
    StudentCourseRawRecord,
    StudentTotalsRawRecord,
    UserRepository,
)
from app.schemas.course import StaffGradingState
from app.schemas.schedule import CourseScheduleTargetProtocol, ScheduleRuleProtocol
from app.schemas.user import (
    StudentCoursePerformanceResponse,
    StudentPerformanceTotalsResponse,
)
from app.services.schedule_service import LessonScheduleService


class StudentProfileService:
    def __init__(
        self,
        user_repo: UserRepository,
        schedule_service: Optional[LessonScheduleService] = None,
    ) -> None:
        self.user_repo = user_repo
        self.schedule_service = schedule_service or LessonScheduleService()

    def build_performance_totals(
        self,
        raw_totals: StudentTotalsRawRecord
    ) -> StudentPerformanceTotalsResponse:
        has_summaries = raw_totals.summaries_count > 0
        grading_state: StaffGradingState = "unknown" if has_summaries else "missing"
        total_lessons = raw_totals.total_lessons
        attended_lessons = raw_totals.attendance_count
        absences = total_lessons - attended_lessons

        raw_avg_percentage = (
            round(float(raw_totals.avg_score_raw), 2)
            if (raw_totals.avg_score_raw is not None and raw_totals.periods_with_max_score_count > 0)
            else None
        )
        truthful_attendance_percentage = (
            round((attended_lessons * 100.0 / total_lessons), 1)
            if total_lessons > 0
            else None
        )

        return StudentPerformanceTotalsResponse(
            scope="all_recorded_student_period_summaries",
            measured_population="all_recorded_student_period_summaries",
            denominator_basis="stored_period_total_lessons",
            grading_state=grading_state,
            grading_provenance="unknown",
            raw_avg_percentage=raw_avg_percentage,
            attendance_percentage=truthful_attendance_percentage,
            attendance_denominator=total_lessons,
            attended_lessons=attended_lessons,
            absences=absences,
            total_lessons=total_lessons,
            period_summaries_count=raw_totals.summaries_count,
            periods_with_max_score_count=raw_totals.periods_with_max_score_count,
            total_score=raw_totals.total_score,
            total_max_score=raw_totals.total_max_score,
        )

    def build_course_performance(
        self,
        raw_course: Optional[StudentCourseRawRecord]
    ) -> StudentCoursePerformanceResponse:
        if raw_course is None or raw_course.summaries_count == 0:
            return StudentCoursePerformanceResponse(
                scope="single_course",
                measured_population="single_course_recorded_period_summaries",
                denominator_basis="stored_period_total_lessons",
                grading_state="missing",
                grading_provenance="unknown",
                raw_avg_percentage=None,
                attendance_percentage=None,
                attendance_denominator=0,
                attended_lessons=0,
                absences=0,
                total_lessons=0,
                period_summaries_count=0,
                periods_with_max_score_count=0,
            )

        total_lessons = raw_course.total_lessons
        attended_lessons = raw_course.attendance_count
        absences = total_lessons - attended_lessons
        raw_avg_percentage = (
            round(float(raw_course.avg_score_raw), 2)
            if (raw_course.avg_score_raw is not None and raw_course.periods_with_max_score_count > 0)
            else None
        )
        truthful_attendance_percentage = (
            round((attended_lessons * 100.0 / total_lessons), 1)
            if total_lessons > 0
            else None
        )

        return StudentCoursePerformanceResponse(
            scope="single_course",
            measured_population="single_course_recorded_period_summaries",
            denominator_basis="stored_period_total_lessons",
            grading_state="unknown",
            grading_provenance="unknown",
            raw_avg_percentage=raw_avg_percentage,
            attendance_percentage=truthful_attendance_percentage,
            attendance_denominator=total_lessons,
            attended_lessons=attended_lessons,
            absences=absences,
            total_lessons=total_lessons,
            period_summaries_count=raw_course.summaries_count,
            periods_with_max_score_count=raw_course.periods_with_max_score_count,
            total_score=raw_course.total_score,
            total_max_score=raw_course.total_max_score,
        )

    async def get_student_profile_payload(
        self,
        student_id: int,
        current_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        snapshot_time = current_time if current_time is not None else self.schedule_service.get_current_time()
        stats = await self.user_repo.get_student_profile_stats(student_id)
        raw_totals = stats.pop("raw_totals", None)
        if not isinstance(raw_totals, StudentTotalsRawRecord):
            raise ValueError("Repository contract violation: missing required 'raw_totals' aggregate record")
        raw_courses: Dict[int, StudentCourseRawRecord] = stats.pop("raw_courses", {})

        stats["performance"] = self.build_performance_totals(raw_totals)

        courses = stats.get("courses", [])
        for course_entry in courses:
            course: Optional[CourseScheduleTargetProtocol] = course_entry.get("course")
            schedules: Sequence[ScheduleRuleProtocol] = course_entry.pop("schedules", [])
            enrollment_status = course_entry.get("enrollment_status")
            bucket = course_entry.get("bucket")

            course_id = getattr(course, "id", None) if course is not None else None
            raw_course = raw_courses.get(course_id) if course_id is not None else None
            course_entry["performance"] = self.build_course_performance(raw_course)

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
