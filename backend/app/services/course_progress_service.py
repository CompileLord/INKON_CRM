from dataclasses import replace
from typing import Dict, List, Optional, Tuple
from datetime import date
from app.core.scoring import ScoringPolicy
from app.repositories.interfaces.course_progress_repository import (
    CourseChartSnapshot,
    ChartPeriodAggregate,
    ChartStudentAggregate,
    CourseProgressRepositoryInterface,
    CourseProgressSnapshot,
    ProgressSummaryRecord,
    ProgressStudentRecord,
    ProgressPeriodRecord,
)
from app.schemas.course import (
    CourseStaffProgressResponse,
    StaffProgressPeriod,
    StaffProgressPeriodResult,
    StaffProgressStudent,
)

from app.schemas.course_progress import (
    ChartDataset, ChartGradingState, ChartPeriod, ChartQuery, StaffChartResponse, StudentChartResponse,
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

    async def get_progress_chart(
        self, course_id: int, student_id: int | None = None, bounds: ChartQuery | None = None
    ) -> StaffChartResponse | StudentChartResponse:
        snapshot: CourseChartSnapshot
        if bounds is None:
            snapshot = await self.repo.get_course_chart_snapshot(course_id, student_id)
            bounds = ChartQuery()
        else:
            snapshot = await self.repo.get_course_chart_snapshot(
                course_id, student_id, period_offset=bounds.period_offset, period_limit=bounds.period_limit,
                student_offset=bounds.student_offset, student_limit=bounds.student_limit,
            )
        progress: CourseProgressSnapshot = snapshot.progress
        summaries: dict[tuple[int, int], ProgressSummaryRecord] = {
            (summary.student_id, summary.journal_id): summary for summary in progress.summaries
        }
        aggregates: dict[int, ChartStudentAggregate] = {
            aggregate.student_id: aggregate for aggregate in snapshot.student_aggregates
        }
        period_aggregates: dict[int, ChartPeriodAggregate] = {
            aggregate.journal_id: aggregate for aggregate in snapshot.period_aggregates
        }
        periods: list[ChartPeriod] = [ChartPeriod(id=period.id, period_label=period.period_label) for period in progress.periods]
        class_series: list[float | None] = [
            round(period_aggregates[period.id].mean_percentage, 2) if period.id in period_aggregates else None
            for period in progress.periods
        ]
        class_series.append(round(snapshot.class_mean, 2) if snapshot.class_mean is not None else None)
        class_counts: list[int] = [period_aggregates[period.id].eligible_count if period.id in period_aggregates else 0 for period in progress.periods]
        datasets: list[ChartDataset] = []
        palette: tuple[str, ...] = (
            "#E53E3E", "#319795", "#3182CE", "#D69E2E", "#D53F8C",
            "#805AD5", "#DD6B20", "#38A169", "#00B5D8", "#B83280",
            "#4C51BF", "#C05621", "#2B6CB0", "#2F855A", "#9B2C2C",
            "#2C7A7B", "#6B46C1", "#975A16", "#702459", "#1A365D",
        )
        index: int
        student: ProgressStudentRecord
        for index, student in enumerate(progress.students):
            if student_id is not None and student.student_id != student_id:
                continue
            scores: list[float | None] = []
            maxima: list[float | None] = []
            percentages: list[float | None] = []
            states: list[ChartGradingState] = []
            period: ProgressPeriodRecord
            for period in progress.periods:
                summary: ProgressSummaryRecord | None = summaries.get((student.student_id, period.id))
                state: ChartGradingState = (
                    "upcoming" if period.period_start > date.today() else
                    "missing" if summary is None else
                    "graded" if summary.is_graded is True else
                    "ungraded" if summary.is_graded is False else "unknown"
                )
                states.append(state)
                scores.append(float(summary.sum_score) if summary is not None and state == "graded" else None)
                maxima.append(float(summary.max_period_score) if summary is not None and state == "graded" else None)
                percentages.append(ScoringPolicy.percentage(summary.sum_score, summary.max_period_score) if summary is not None and state == "graded" and summary.max_period_score > 0 else None)
            aggregate: ChartStudentAggregate | None = aggregates.get(student.student_id)
            scores.append(round(aggregate.mean_score, 2) if aggregate else None)
            maxima.append(round(aggregate.mean_maximum, 2) if aggregate else None)
            percentages.append(round(aggregate.mean_percentage, 2) if aggregate else None)
            datasets.append(ChartDataset(
                student_id=student.student_id,
                name=f"{student.first_name} {student.last_name}",
                color_hex=student.color_hex if student.color_hex and student.color_hex != "#FF5733" else palette[index % len(palette)],
                scores=scores,
                max_scores=maxima,
                percentages=percentages,
                grading_states=states,
                graded_periods_count=states.count("graded"),
                eligible_periods_count=aggregate.eligible_count if aggregate else 0,
            ))
        if student_id is not None:
            own: ChartDataset | None = next((dataset for dataset in datasets if dataset.student_id == student_id), None)
            return StudentChartResponse(
                period_offset=bounds.period_offset,
                period_limit=bounds.period_limit,
                periods_total=snapshot.periods_total,
                periods=periods,
                my_series=own.percentages if own else [None] * (len(periods) + 1),
                my_grading_states=own.grading_states if own else ["missing"] * len(periods),
                my_graded_periods_count=own.graded_periods_count if own else 0,
                my_eligible_periods_count=own.eligible_periods_count if own else 0,
                class_avg_series=class_series,
                class_eligible_counts=class_counts,
                my_rank=snapshot.ranks.get(student_id),
                class_size=snapshot.class_size,
            )
        return StaffChartResponse(
            period_offset=bounds.period_offset,
            period_limit=bounds.period_limit,
            periods_total=snapshot.periods_total,
            student_offset=bounds.student_offset,
            student_limit=bounds.student_limit,
            students_total=snapshot.class_size,
            labels=[period.period_label for period in periods] + ["Average"],
            periods=periods,
            datasets=datasets,
            class_avg_series=class_series,
            class_eligible_counts=class_counts,
        )
