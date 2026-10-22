import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ProgressLineChart, type ProgressLineSeries } from "../ui/charts/ProgressLineChart";
import { usePeriodName } from "../ui/periodName";
import { SectionCard } from "../ui/SectionCard";
import { CourseScore } from "./CourseScore";
import { StudentCourseEntry } from "./StudentCourseEntry";
import { StudentCourseStagePill } from "./StudentCourseStagePill";
import { formatNumber, formatPercentage, formatSchoolLessonDate, formatSchoolPeriodSpan } from "../../i18n/formatters";
import { getStudentCourseLink } from "../../lib/students/studentNavigation";
import { StudentProgressSeriesBuilder, type StudentProgressSeries } from "../../lib/students/StudentProgressSeriesBuilder";
import { useStudentProgressSeries } from "../../lib/students/useStudentProgressSeries";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";

interface StudentProgressPanelProps {
  studentId: number;
  courses: StudentCourseProfile[];
  role: string | null;
  currentUserId: number | null;
}

function CourseProgressRow({ item, role, currentUserId, latestTotal }: { item: StudentCourseProfile; role: string | null; currentUserId: number | null; latestTotal: number | null }) {
  const { t, i18n } = useTranslation("studentProfile");
  const linkInfo = getStudentCourseLink(item.course.id, item.course.mentor_id, role, currentUserId);
  const stats = item.performance && item.performance.period_summaries_count > 0 ? item.performance : null;
  const attendance: number | null = stats !== null && stats.attendance_denominator > 0 ? stats.attendance_percentage : null;
  const total: number | null = latestTotal ?? (typeof item.my_total_score === "number" && (item.my_total_max_score ?? 0) > 0 ? item.my_total_score : null);
  const hasLessons: boolean = stats !== null && stats.total_lessons > 0;

  return (
    <li data-testid="course-progress-row">
      <StudentCourseEntry to={linkInfo.to} isNavigable={linkInfo.isNavigable}>
        <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{item.course.title}</span>
            <StudentCourseStagePill course={item} />
          </span>
          {total !== null || hasLessons ? (
            <span className="flex min-w-0 max-w-full flex-wrap items-baseline justify-end gap-x-4 gap-y-1 text-sm">
              {total !== null ? <CourseScore score={total} /> : null}
              {hasLessons && attendance !== null ? (
                <span className="tabular-nums text-muted">{t("progress.attendanceShort", { value: formatNumber(attendance, i18n.language, { maximumFractionDigits: 0 }) })}</span>
              ) : null}
              {hasLessons && stats !== null ? (
                <span className="tabular-nums text-muted">{t("stats.absencesOf", { absences: formatNumber(stats.absences, i18n.language), total: formatNumber(stats.total_lessons, i18n.language) })}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-xs text-muted">{t("progress.rowNoData")}</span>
          )}
        </span>
      </StudentCourseEntry>
    </li>
  );
}

export function StudentProgressPanel({ studentId, courses, role, currentUserId }: StudentProgressPanelProps) {
  const { t, i18n } = useTranslation(["studentProfile", "common"]);
  const periodName = usePeriodName();
  const progress = useStudentProgressSeries(studentId, courses.map((item: StudentCourseProfile) => ({ id: item.course.id, title: item.course.title })), role === "student");
  const drawable: StudentProgressSeries[] = progress.series.filter((series: StudentProgressSeries) => StudentProgressSeriesBuilder.gradedPeriodCount(series) > 0);
  const longestLabels: string[] = progress.series.reduce<string[]>((longest: string[], series: StudentProgressSeries) => (series.periodLabels.length > longest.length ? series.periodLabels : longest), []);
  const chartSeries: ProgressLineSeries[] = drawable.map((series: StudentProgressSeries) => ({
    key: String(series.courseId),
    name: series.title,
    slot: series.slot,
    values: series.values,
    pointLabels: series.periodLabels.map(periodName),
  }));
  const showChart: boolean = courses.length > 0 && StudentProgressSeriesBuilder.canDrawChart(progress.series);

  return (
    <SectionCard title={t("progress.title")} info={t("progress.method")}>
      {courses.length === 0 ? (
        <EmptyState title={t("courses.emptyTitle")} description={t("courses.empty")} />
      ) : progress.isLoading ? (
        <div data-testid="progress-chart-skeleton" role="status" aria-busy="true" className="h-[260px] w-full rounded-[10px] bg-strip motion-safe:animate-pulse">
          <span className="sr-only">{t("common:loading")}</span>
        </div>
      ) : progress.isError ? (
        <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <p className="text-base font-medium text-ink">{t("progress.errorTitle")}</p>
          <p className="max-w-md text-sm text-muted">{t("progress.errorBody")}</p>
          <Button type="button" variant="secondary" className="mt-2" onClick={progress.refetch}>
            <RotateCcw size={16} aria-hidden="true" />
            {t("common:retry")}
          </Button>
        </div>
      ) : showChart ? (
        <ProgressLineChart
          series={chartSeries}
          axisLabels={longestLabels.map(periodName)}
          chartLabel={t("progress.chartLabel")}
          keyboardHint={t("progress.chartHint")}
          noValuesLabel={t("progress.chartNoValues")}
          formatValue={(value: number) => formatPercentage(value, i18n.language)}
          formatAxisValue={(value: number) => formatNumber(value, i18n.language)}
          describeEntry={(name: string, formattedValue: string) => t("progress.chartEntry", { name, value: formattedValue })}
        />
      ) : progress.history?.items.length === 0 ? null : (
        <EmptyState title={t("progress.emptyTitle")} description={t("progress.emptyBody")} />
      )}

      {progress.history && progress.isLoading && (
        <ul aria-label={t("common:loading")} aria-busy="true" className="divide-y divide-border rounded-2xl border border-border bg-card motion-safe:animate-pulse">
          {[0, 1, 2].map((row: number) => <li key={row} className="flex items-center justify-between gap-2 p-4"><span className="h-10 w-48 max-w-full rounded bg-strip" /><span className="h-5 w-12 rounded bg-strip" /></li>)}
        </ul>
      )}

      {progress.history && !progress.isLoading && !progress.isError && (
        <div className="mt-4 min-w-0 space-y-3" data-testid="student-history">
          {progress.history.items.length > 0 && <p className="text-sm text-muted tabular-nums">{t(progress.history.hasMore ? "progress.historyWindow" : "progress.historyComplete", { count: progress.history.items.length })}</p>}
          {progress.history.items.length === 0 ? (
            <EmptyState title={t("progress.historyEmptyTitle")} description={t(progress.history.hasUpcoming ? "progress.historyUpcoming" : "progress.historyEmptyBody")} />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {progress.history.items.map((period: StudentJournalPeriod) => (
                <li key={period.journal_id} title={`${periodName(period.period_label)} · ${formatSchoolLessonDate(period.period_start)} – ${formatSchoolLessonDate(period.period_end)}`} className="flex min-w-0 items-baseline justify-between gap-3 p-4">
                  <span className="min-w-0 break-words text-sm text-ink">{period.course_title}<span className="ml-2 text-xs text-muted tabular-nums">{formatSchoolPeriodSpan(period.period_start, period.period_end, i18n.language)}</span></span>
                  {period.state === "graded" ? <span data-testid="period-total" className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatNumber(period.sum_score, i18n.language)}</span> : <span className="shrink-0 text-xs text-muted">{t("progress.rowNoData")}</span>}
                </li>
              ))}
            </ul>
          )}
          {progress.history.hasMore && <Button type="button" variant="secondary" loading={progress.history.loadingMore} onClick={progress.history.loadMore}>{t("progress.loadMore")}</Button>}
        </div>
      )}

      {courses.length > 0 ? (
        <ul aria-label={t("progress.coursesLabel")} className="flex flex-col divide-y divide-border">
          {courses.map((item: StudentCourseProfile) => (
            <CourseProgressRow key={item.course.id} item={item} role={role} currentUserId={currentUserId} latestTotal={progress.series.find((series: StudentProgressSeries) => series.courseId === item.course.id)?.latestTotal ?? null} />
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
