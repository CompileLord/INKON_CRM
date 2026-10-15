import { Link } from "react-router-dom";
import { AlertCircle, RotateCcw, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { ProgressLineChart, type ProgressLineSeries } from "../ui/charts/ProgressLineChart";
import { StudentCourseStagePill } from "./StudentCourseStagePill";
import { formatDate, formatNumber, formatPercentage } from "../../i18n/formatters";
import { getStudentCourseLink } from "../../lib/students/studentNavigation";
import { StudentProgressSeriesBuilder, type StudentProgressSeries } from "../../lib/students/StudentProgressSeriesBuilder";
import { useStudentProgressSeries } from "../../lib/students/useStudentProgressSeries";
import type { StudentCourseProfile, StudentPerformanceTotals } from "../../lib/users/types";

interface StudentProgressPanelProps {
  studentId: number;
  courses: StudentCourseProfile[];
  performance: StudentPerformanceTotals | null | undefined;
  role: string | null;
  currentUserId: number | null;
}

function StudentCourseProgressRow({
  item,
  role,
  currentUserId,
}: {
  item: StudentCourseProfile;
  role: string | null;
  currentUserId: number | null;
}) {
  const { t, i18n } = useTranslation("students");
  const linkInfo = getStudentCourseLink(item.course.id, item.course.mentor_id, role, currentUserId);
  const performance = item.performance;

  return (
    <li
      data-testid="course-progress-row"
      className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          {linkInfo.isNavigable ? (
            <Link
              to={linkInfo.to}
              className="min-w-0 truncate text-sm font-semibold text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              title={item.course.title}
            >
              {item.course.title}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-sm font-semibold text-ink" title={item.course.title}>
              {item.course.title}
            </span>
          )}
          <StudentCourseStagePill course={item} />
        </div>
        <span className="text-xs text-muted tabular-nums">
          {formatDate(item.course.start_date, i18n.language)} – {formatDate(item.course.end_date, i18n.language)}
        </span>
      </div>
      {performance && performance.period_summaries_count > 0 ? (
        <dl className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted">{t("stats.average")}</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {performance.raw_avg_percentage !== null ? (
                formatNumber(performance.raw_avg_percentage, i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              ) : (
                <>
                  <span aria-hidden="true">{t("missingScoreValue")}</span>
                  <span className="sr-only">{t("scoreUnavailable")}</span>
                </>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted">{t("stats.attendance")}</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {performance.attendance_percentage !== null && performance.attendance_denominator > 0 ? (
                `${formatNumber(performance.attendance_percentage, i18n.language, { maximumFractionDigits: 0 })}%`
              ) : (
                <>
                  <span aria-hidden="true">{t("missingScoreValue")}</span>
                  <span className="sr-only">{t("attendanceUnavailable")}</span>
                </>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted">{t("stats.absences")}</dt>
            <dd className="font-semibold tabular-nums text-ink">
              {t("stats.absencesOf", {
                absences: formatNumber(performance.absences, i18n.language),
                total: formatNumber(performance.total_lessons, i18n.language),
              })}
            </dd>
          </div>
        </dl>
      ) : (
        <span className="text-xs text-muted">{t("progress.rowNoData")}</span>
      )}
    </li>
  );
}

export function StudentProgressPanel({ studentId, courses, performance, role, currentUserId }: StudentProgressPanelProps) {
  const { t, i18n } = useTranslation(["students", "common"]);
  const progress = useStudentProgressSeries(
    studentId,
    courses.map((item) => ({ id: item.course.id, title: item.course.title })),
    role === "student",
  );
  const drawable: StudentProgressSeries[] = progress.series.filter(
    (series) => StudentProgressSeriesBuilder.gradedPeriodCount(series) > 0,
  );
  const longestLabels: string[] = progress.series.reduce<string[]>(
    (longest, series) => (series.periodLabels.length > longest.length ? series.periodLabels : longest),
    [],
  );
  const chartSeries: ProgressLineSeries[] = drawable.map((series) => ({
    key: String(series.courseId),
    name: series.title,
    slot: series.slot,
    values: series.values,
    pointLabels: series.periodLabels,
  }));
  const showChart: boolean = courses.length > 0 && StudentProgressSeriesBuilder.canDrawChart(progress.series);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border-warm bg-card p-4 md:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-ink">{t("progress.title")}</h2>
        <InfoTooltip label={t("progress.methodInfoLabel")}>
          <dl className="flex flex-col gap-1.5 text-xs">
            <div>
              <dt className="text-muted">{t("performance.scopeLabel")}</dt>
              <dd className="font-medium text-ink">{t("performance.scopeAllRecordedSummaries")}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("performance.denominatorBasisLabel")}</dt>
              <dd className="font-medium text-ink">{t("performance.basisStoredPeriodTotalLessons")}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("performance.gradingProvenanceLabel")}</dt>
              <dd className="font-medium text-ink">{t("performance.gradingProvenanceUnknown")}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("performance.gradingStateLabel")}</dt>
              <dd className="font-medium text-ink">
                {performance?.grading_state === "missing"
                  ? t("performance.gradingStateMissing")
                  : t("performance.gradingStateUnknown")}
              </dd>
            </div>
          </dl>
        </InfoTooltip>
      </div>

      {courses.length === 0 ? (
        <p className="text-sm text-muted">{t("noCourses")}</p>
      ) : progress.isLoading ? (
        <div data-testid="progress-chart-skeleton" role="status" aria-busy="true" className="h-[260px] w-full rounded-[10px] bg-strip motion-safe:animate-pulse">
          <span className="sr-only">{t("common:loading")}</span>
        </div>
      ) : progress.isError ? (
        <div role="alert" className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[10px] bg-strip px-4 py-8 text-center">
          <AlertCircle size={24} className="text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">{t("progress.errorTitle")}</p>
            <p className="mt-1 text-xs text-muted">{t("progress.errorBody")}</p>
          </div>
          <Button type="button" variant="secondary" onClick={progress.refetch} className="min-h-11">
            <RotateCcw size={16} className="mr-1.5" aria-hidden="true" />
            {t("common:retry")}
          </Button>
        </div>
      ) : showChart ? (
        <ProgressLineChart
          series={chartSeries}
          axisLabels={longestLabels}
          chartLabel={t("progress.chartLabel")}
          keyboardHint={t("progress.chartHint")}
          noValuesLabel={t("progress.chartNoValues")}
          formatValue={(value) => formatPercentage(value, i18n.language)}
          formatAxisValue={(value) => formatNumber(value, i18n.language)}
          describeEntry={(name, formattedValue) => t("progress.chartEntry", { name, value: formattedValue })}
        />
      ) : (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[10px] bg-strip px-4 py-8 text-center">
          <TrendingUp size={24} className="text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">{t("progress.emptyTitle")}</p>
          <p className="max-w-sm text-xs text-muted">{t("progress.emptyBody")}</p>
        </div>
      )}

      {courses.length > 0 && (
        <ul aria-label={t("progress.coursesLabel")} className="flex flex-col divide-y divide-border">
          {courses.map((item) => (
            <StudentCourseProgressRow key={item.course.id} item={item} role={role} currentUserId={currentUserId} />
          ))}
        </ul>
      )}
    </div>
  );
}
