import { useTranslation } from "react-i18next";
import type { CourseJournalMetricsResponse } from "../../lib/courses/types";
import { Button } from "../ui/Button";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { ScoreFormat } from "../profile/ScoreFormat";
import { formatNumber } from "../../i18n/formatters";

interface CourseDetailMetricsStripProps {
  enrollmentsTotal?: number;
  isEnrollmentsLoading?: boolean;
  isEnrollmentsError?: boolean;
  onRetryEnrollments?: () => void;
  journalMetrics?: CourseJournalMetricsResponse;
  isMetricsLoading?: boolean;
  isMetricsError?: boolean;
  onRetryMetrics?: () => void;
}

export function CourseDetailMetricsStrip({
  enrollmentsTotal,
  isEnrollmentsLoading = false,
  isEnrollmentsError = false,
  onRetryEnrollments,
  journalMetrics,
  isMetricsLoading = false,
  isMetricsError = false,
  onRetryMetrics,
}: CourseDetailMetricsStripProps) {
  const { t, i18n } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");

  const hasGradedPeriods: boolean = journalMetrics !== undefined && (journalMetrics.periods_complete > 0 || (journalMetrics.class_avg_max_score ?? 0) > 0);
  const isEnrollmentsPending: boolean = isEnrollmentsLoading && enrollmentsTotal === undefined;
  const isMetricsPending: boolean = isMetricsLoading && journalMetrics === undefined;

  const pending = <span aria-hidden="true" className="inline-block h-7 w-14 rounded bg-strip align-middle motion-safe:animate-pulse" />;
  const retry = (onRetry: (() => void) | undefined, message: string) => (
    <span className="flex flex-wrap items-center gap-2 text-sm font-normal text-destructive">
      <span>{message}</span>
      {onRetry ? <Button type="button" variant="secondary" onClick={onRetry}>{tCommon("retry")}</Button> : null}
    </span>
  );

  const enrollmentsValue = isEnrollmentsPending ? pending
    : isEnrollmentsError && enrollmentsTotal === undefined ? retry(onRetryEnrollments, t("metrics.studentsError"))
    : typeof enrollmentsTotal === "number" ? formatNumber(enrollmentsTotal, i18n.language)
    : null;

  const averageRatio: string | null = hasGradedPeriods ? ScoreFormat.ratio(journalMetrics?.class_avg_score, journalMetrics?.class_avg_max_score, i18n.language) : null;
  const averagePercent: string | null = hasGradedPeriods ? ScoreFormat.percentHint(journalMetrics?.class_avg_score, journalMetrics?.class_avg_max_score, i18n.language) : null;
  const attendanceValue: string | null = hasGradedPeriods && journalMetrics
    ? `${formatNumber(journalMetrics.attendance_rate, i18n.language, { maximumFractionDigits: 0 })}%`
    : null;

  const averageValue = isMetricsPending ? pending : isMetricsError ? retry(onRetryMetrics, t("metrics.figuresError")) : averageRatio;
  const attendanceTileValue = isMetricsPending ? pending : isMetricsError ? retry(onRetryMetrics, t("metrics.figuresError")) : attendanceValue;

  return (
    <div role="region" aria-label={t("metrics.label")}>
      <StatGroup>
        <StatTile label={t("metrics.students")} value={enrollmentsValue} />
        <StatTile label={t("metrics.classAverage")} value={averageValue} hint={averagePercent ?? undefined} />
        <StatTile label={t("metrics.attendance")} value={attendanceTileValue} />
      </StatGroup>
    </div>
  );
}
