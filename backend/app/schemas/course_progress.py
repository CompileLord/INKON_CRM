from typing import Literal, TypeAlias
from pydantic import BaseModel


ChartGradingState: TypeAlias = Literal["missing", "ungraded", "unknown", "graded", "upcoming"]


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


class StaffChartResponse(BaseModel):
    labels: list[str]
    periods: list[ChartPeriod]
    datasets: list[ChartDataset]
    class_avg_series: list[float | None]
    class_eligible_counts: list[int]


class StudentChartResponse(BaseModel):
    periods: list[ChartPeriod]
    my_series: list[float | None]
    class_avg_series: list[float | None]
    my_grading_states: list[ChartGradingState]
    my_graded_periods_count: int
    my_eligible_periods_count: int
    class_eligible_counts: list[int]
    my_rank: int | None
    class_size: int
