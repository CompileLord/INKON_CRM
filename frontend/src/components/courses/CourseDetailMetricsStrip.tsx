import { useTranslation } from "react-i18next";
import type { CourseJournalMetricsResponse } from "../../lib/courses/types";
import { Button } from "../ui/Button";
import { formatNumber } from "../../i18n/formatters";
import { RotateCcw } from "lucide-react";

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
  const { t } = useTranslation(["courses", "common"]);

  return (
    <div
      role="region"
      aria-label={t("metrics.classAverage")}
      className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 rounded-xl border border-border bg-strip p-3 sm:p-4 divide-y sm:divide-y-0 sm:divide-x divide-border min-w-0 max-w-full"
    >
      <div className="flex flex-col justify-center pt-2 sm:pt-0 sm:px-3 first:pt-0 first:px-0 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted break-words leading-tight">
          {t("metrics.totalEnrollments")}
        </span>
        <div className="mt-1 flex flex-wrap items-baseline gap-2 min-w-0">
          {isEnrollmentsLoading && enrollmentsTotal === undefined ? (
            <div className="h-6 w-12 rounded bg-border motion-safe:animate-pulse" />
          ) : isEnrollmentsError && enrollmentsTotal === undefined ? (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs text-destructive leading-tight break-words">
                {t("metrics.enrollmentsLoadError")}
              </span>
              {onRetryEnrollments ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onRetryEnrollments}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs gap-1"
                >
                  <RotateCcw size={13} />
                  <span>{t("common:retry")}</span>
                </Button>
              ) : null}
            </div>
          ) : typeof enrollmentsTotal === "number" ? (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-base sm:text-xl font-bold tabular-nums text-ink">
                {formatNumber(enrollmentsTotal)}
              </span>
              {isEnrollmentsError && onRetryEnrollments ? (
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-xs text-destructive leading-tight">
                    {t("metrics.enrollmentsLoadError")}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onRetryEnrollments}
                    className="min-h-[44px] min-w-[44px] px-2.5 py-1 text-xs gap-1"
                  >
                    <RotateCcw size={12} />
                    <span>{t("common:retry")}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <span
              className="text-base sm:text-xl font-bold text-muted tabular-nums"
              aria-label={t("metrics.unavailable")}
            >
              —
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center pt-3 sm:pt-0 sm:px-3 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted break-words leading-tight">
          {t("metrics.classAverage")}
        </span>
        <div className="mt-1 flex flex-col justify-center min-w-0">
          {isMetricsLoading && !journalMetrics ? (
            <div className="h-6 w-16 rounded bg-border motion-safe:animate-pulse" />
          ) : isMetricsError ? (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs text-destructive leading-tight break-words">
                {t("metrics.metricsLoadError")}
              </span>
              {onRetryMetrics ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onRetryMetrics}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs gap-1"
                >
                  <RotateCcw size={13} />
                  <span>{t("common:retry")}</span>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col min-w-0">
              <span
                className="text-base sm:text-xl font-bold text-muted tabular-nums"
                aria-label={t("metrics.unavailable")}
              >
                —
              </span>
              <span className="text-xs text-muted leading-tight mt-0.5 break-words">
                {t("metrics.gradeAvailabilityNotice")}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center pt-3 sm:pt-0 sm:px-3 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted break-words leading-tight">
          {t("metrics.attendance")}
        </span>
        <div className="mt-1 flex flex-col justify-center min-w-0">
          {isMetricsLoading && !journalMetrics ? (
            <div className="h-6 w-16 rounded bg-border motion-safe:animate-pulse" />
          ) : isMetricsError ? (
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs text-destructive leading-tight break-words">
                {t("metrics.metricsLoadError")}
              </span>
              {onRetryMetrics ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onRetryMetrics}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 text-xs gap-1"
                >
                  <RotateCcw size={13} />
                  <span>{t("common:retry")}</span>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col min-w-0">
              <span
                className="text-base sm:text-xl font-bold text-muted tabular-nums"
                aria-label={t("metrics.unavailable")}
              >
                —
              </span>
              <span className="text-xs text-muted leading-tight mt-0.5 break-words">
                {t("metrics.attendanceAvailabilityNotice")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
