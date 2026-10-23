import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useCourseProgressChart } from "../../lib/courses/hooks";
import { CourseChartResponses } from "../../lib/courses/CourseChartResponses";
import { CourseChartWindow } from "../../lib/courses/CourseChartWindow";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import { ProgressLineChart, type ProgressLineSeries } from "../ui/charts/ProgressLineChart";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { SectionCard } from "../ui/SectionCard";
import { usePeriodName } from "../ui/periodName";
import { ChartStepper } from "./ChartStepper";
import type { CourseProgressChartResponse, CourseProgressPeriod } from "../../lib/courses/types";

interface CourseProgressChartPanelProps {
  courseId: number;
}

const SERIES_SLOT_COUNT: number = 8;

export function CourseProgressChartPanel({ courseId }: CourseProgressChartPanelProps) {
  const { t, i18n } = useTranslation("courseDetail");
  const periodName = usePeriodName();
  const [periodOffset, setPeriodOffset] = useState<number>(0);
  const [studentOffset, setStudentOffset] = useState<number>(0);
  const query = useCourseProgressChart(courseId, { periodOffset, studentOffset });
  const chart: CourseProgressChartResponse | undefined = query.data;

  if (chart === undefined) {
    if (query.isError) return <SectionCard title={t("chart.title")}><ErrorState message={t("chart.loadError")} onRetry={() => void query.refetch()} /></SectionCard>;
    return (
      <SectionCard title={t("chart.title")}>
        <div data-testid="course-chart-skeleton" role="status" aria-busy="true" className="h-[260px] w-full rounded-[10px] bg-strip motion-safe:animate-pulse">
          <span className="sr-only">{t("chart.loading")}</span>
        </div>
      </SectionCard>
    );
  }

  const periods: CourseProgressPeriod[] = chart.periods;
  const pointCount: number = periods.length;
  const pointLabels: string[] = periods.map((period: CourseProgressPeriod) => periodName(period.period_label));
  const periodWindow = { offset: chart.period_offset, limit: chart.period_limit, total: chart.periods_total };
  const rangeLabel: string = pointCount === 0 ? "" : pointCount === 1 ? pointLabels[0] : t("chart.range", { from: pointLabels[0], to: pointLabels[pointCount - 1] });
  const average = (value: number | null): string => (value === null ? "—" : formatPercentage(value, i18n.language));
  const classSeries: ProgressLineSeries = {
    key: "class-average",
    name: t("chart.classAverage"),
    slot: 1,
    values: CourseChartWindow.pointValues(chart.class_avg_series, pointCount),
    pointLabels,
  };

  if (!CourseChartResponses.isStaff(chart)) return null;
  const series: ProgressLineSeries[] = [
    ...chart.datasets.map((dataset, index: number): ProgressLineSeries => ({
      key: String(dataset.student_id),
      name: dataset.name,
      slot: (index + 2) % SERIES_SLOT_COUNT,
      values: CourseChartWindow.pointValues(dataset.percentages, pointCount),
      pointLabels,
    })),
    classSeries,
  ];
  const summary: string = t("chart.staffAverage", { value: average(CourseChartWindow.trailingAverage(chart.class_avg_series, pointCount)) });
  const studentWindow = { offset: chart.student_offset, limit: chart.student_limit, total: chart.students_total };
  let studentStepper: ReactElement | null = null;
  if (chart.students_total > chart.student_limit) {
    const from: number = chart.student_offset + 1;
    const to: number = Math.min(chart.student_offset + chart.student_limit, chart.students_total);
    studentStepper = (
      <ChartStepper
        testId="course-chart-student-pager"
        label={t("chart.studentRange", { from: formatNumber(from, i18n.language), to: formatNumber(to, i18n.language), total: formatNumber(chart.students_total, i18n.language) })}
        previousLabel={t("chart.previousStudents")}
        nextLabel={t("chart.nextStudents")}
        previousDisabled={!CourseChartWindow.hasNewer(studentWindow)}
        nextDisabled={!CourseChartWindow.hasOlder(studentWindow)}
        onPrevious={() => setStudentOffset(CourseChartWindow.newer(studentWindow))}
        onNext={() => setStudentOffset(CourseChartWindow.older(studentWindow))}
      />
    );
  }
  const drawable: ProgressLineSeries[] = series.filter((item: ProgressLineSeries) => item.values.some((value: number | null) => value !== null));

  return (
    <SectionCard
      title={t("chart.title")}
      actions={
        <ChartStepper
          testId="course-chart-period-pager"
          label={rangeLabel}
          previousLabel={t("chart.olderPeriods")}
          nextLabel={t("chart.newerPeriods")}
          previousDisabled={!CourseChartWindow.hasOlder(periodWindow)}
          nextDisabled={!CourseChartWindow.hasNewer(periodWindow)}
          onPrevious={() => setPeriodOffset(CourseChartWindow.older(periodWindow))}
          onNext={() => setPeriodOffset(CourseChartWindow.newer(periodWindow))}
        />
      }
    >
      {query.isError ? (
        <ErrorState message={t("chart.loadError")} onRetry={() => void query.refetch()} />
      ) : pointCount === 0 || drawable.length === 0 ? (
        <EmptyState title={t("chart.emptyTitle")} description={t("chart.emptyBody")} />
      ) : (
        <div className={`flex min-w-0 flex-col gap-3 transition-opacity duration-150 ease-out ${query.isPlaceholderData ? "opacity-60" : "opacity-100"}`}>
          <ProgressLineChart
            series={drawable}
            axisLabels={pointLabels}
            chartLabel={t("chart.chartLabel")}
            keyboardHint={t("chart.chartHint")}
            noValuesLabel={t("chart.noValues")}
            formatValue={(value: number) => formatPercentage(value, i18n.language)}
            formatAxisValue={(value: number) => formatNumber(value, i18n.language)}
            describeEntry={(name: string, formattedValue: string) => t("chart.entry", { name, value: formattedValue })}
          />
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-muted">
            <span>{summary}</span>
            <InfoTooltip label={t("chart.scopeInfo")}>{t("chart.scopeInfo")}</InfoTooltip>
          </p>
          {studentStepper}
        </div>
      )}
    </SectionCard>
  );
}
