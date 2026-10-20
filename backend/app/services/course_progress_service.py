from dataclasses import replace
from typing import Dict, List, Optional, Tuple
from app.core.scoring import ScoringPolicy
from app.repositories.interfaces.course_progress_repository import (
    CourseProgressRepositoryInterface,
    CourseProgressSnapshot,
    ProgressSummaryRecord,
)
from app.schemas.course import (
    CourseStaffProgressResponse,
    StaffProgressPeriod,
    StaffProgressPeriodResult,
    StaffProgressStudent,
)


class CourseProgressService:
    def __init__(self, repo: CourseProgressRepositoryInterface) -> None:
        self.repo = repo

    async def get_staff_progress(self, course_id: int) -> CourseStaffProgressResponse:
        snapshot = await self.repo.get_course_progress_snapshot(course_id)
        return self._build_progress_response(course_id, snapshot)

    async def get_student_class_progress(self, course_id: int, student_id: int) -> CourseStaffProgressResponse:
        snapshot: CourseProgressSnapshot = await self.repo.get_course_progress_snapshot(course_id, always_include_student_id=student_id)
        snapshot = replace(
            snapshot,
            students=[student for student in snapshot.students if student.student_id == student_id],
            summaries=[summary for summary in snapshot.summaries if summary.student_id == student_id],
        )
        return self._build_progress_response(course_id, snapshot)

    def _build_progress_response(self, course_id: int, snapshot: CourseProgressSnapshot) -> CourseStaffProgressResponse:

        periods: List[StaffProgressPeriod] = [
            StaffProgressPeriod(
                id=p.id,
                period_label=p.period_label,
                period_start=p.period_start,
                period_end=p.period_end,
                class_avg_score=p.class_avg_score,
                class_avg_max_score=p.class_avg_max_score,
                class_avg_percentage=p.class_avg_percentage,
                graded_count=p.graded_count,
            )
            for p in snapshot.periods
        ]

        summary_map: Dict[Tuple[int, int], ProgressSummaryRecord] = {
            (s.student_id, s.journal_id): s for s in snapshot.summaries
        }

        students: List[StaffProgressStudent] = []

        for st in snapshot.students:
            period_results: List[StaffProgressPeriodResult] = []

            for p in snapshot.periods:
                summary = summary_map.get((st.student_id, p.id))
                if summary is None:
                    period_results.append(
                        StaffProgressPeriodResult(
                            period_id=p.id,
                            grading_state="missing",
                            score=None,
                            max_score=None,
                            percentage=None,
                        )
                    )
                else:
                    if summary.max_period_score > 0:
                        percentage: Optional[float] = ScoringPolicy.percentage(
                            summary.sum_score,
                            summary.max_period_score
                        )
                    else:
                        percentage = None

                    period_results.append(
                        StaffProgressPeriodResult(
                            period_id=p.id,
                            grading_state="unknown",
                            score=summary.sum_score,
                            max_score=summary.max_period_score,
                            percentage=percentage,
                        )
                    )

            students.append(
                StaffProgressStudent(
                    student_id=st.student_id,
                    first_name=st.first_name,
                    last_name=st.last_name,
                    period_results=period_results,
                    grading_provenance="unknown",
                )
            )

        return CourseStaffProgressResponse(
            course_id=course_id,
            periods=periods,
            students=students,
        )
