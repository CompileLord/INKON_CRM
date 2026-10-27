from typing import ClassVar, Literal, TypeAlias
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.course import StaffProgressPeriod


ChartGradingState: TypeAlias = Literal["missing", "ungraded", "unknown", "graded", "upcoming"]


class ChartQuery(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")

    period_offset: int = Field(default=0, ge=0, le=2147483647, description="Periods to skip from newest, ordered by period_start then id descending. Default 0, maximum 2147483647.")
    period_limit: int = Field(default=12, ge=1, le=52, description="Maximum periods returned chronologically. Default 12, maximum 52.")
    student_offset: int = Field(default=0, ge=0, le=2147483647, description="Active staff-roster series to skip in student_id ascending order. Ignored for students. Default 0, maximum 2147483647.")
    student_limit: int = Field(default=30, ge=1, le=100, description="Maximum staff-roster series. Ignored for students. Default 30, maximum 100.")


class ChartRangeResponse(BaseModel):
    period_offset: int
    period_limit: int
    periods_total: int = Field(description="Total scheduled course periods, including upcoming periods.")
    aggregation_scope: Literal["selected_periods"] = Field(
        default="selected_periods",
        description="All means, ranks and grading counts use only selected periods. Eligible results are explicitly graded, started, and have positive maxima. Period class means weight eligible active students equally; the final class average weights eligible active-student range means equally. Ranks order unrounded range means descending, then student_id ascending. Missing, ungraded, unknown and upcoming results are excluded.",
    )


class ChartPeriod(BaseModel):
    id: int
    period_label: str


class ChartDataset(BaseModel):
    student_id: int
    name: str
    color_hex: str
    scores: list[float | None]
    max_scores: list[float | None]
    percentages: list[float | None]
    grading_states: list[ChartGradingState]
    graded_periods_count: int
    eligible_periods_count: int


class StaffChartResponse(ChartRangeResponse):
    student_offset: int
    student_limit: int
    students_total: int = Field(description="Total active nondeleted student enrollments, independent of series page and selected range.")
    labels: list[str]
    periods: list[ChartPeriod]
    datasets: list[ChartDataset]
    class_avg_series: list[float | None]
    class_eligible_counts: list[int]


class StudentChartResponse(ChartRangeResponse):
    periods: list[ChartPeriod]
    my_series: list[float | None]
    class_avg_series: list[float | None]
    my_grading_states: list[ChartGradingState]
    my_graded_periods_count: int
    my_eligible_periods_count: int
    class_eligible_counts: list[int]
    my_rank: int | None = Field(description="Rank by selected-period eligible mean among active students, or null without an eligible mean or active enrollment.")
    class_size: int = Field(description="Active nondeleted student cohort size, including students without eligible grades in the selected range.")
