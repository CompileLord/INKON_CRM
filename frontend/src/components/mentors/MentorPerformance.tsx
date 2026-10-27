import { useTranslation } from "react-i18next";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { formatNumber } from "../../i18n/formatters";
import type { MentorAnalyticsResponse, MentorProfileResponse } from "../../lib/users/types";

interface MentorPerformanceProps {
  profile: MentorProfileResponse;
  analytics?: MentorAnalyticsResponse;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

export function MentorPerformance({ profile, analytics, loading, failed, onRetry }: MentorPerformanceProps) {
  const { t, i18n } = useTranslation("mentorProfile");
  const points = (value: number): string => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  const hasGradedPeriods: boolean = profile.avg_score_defined_ratio_count > 0;
  const hasPoints: boolean = analytics !== undefined && analytics.average_student_score_summary_count > 0;
  const pointsValue: string = hasPoints && analytics !== undefined ? points(analytics.average_student_score) : "—";
  const basisText: string = t("performance.basis", {
    count: profile.avg_score_summary_count,
    formatted: formatNumber(profile.avg_score_summary_count, i18n.language),
  });

  const cardClassName: string = "rounded-2xl border border-border bg-card p-4 md:p-5";

  if (loading) {
    return (
      <div role="status" aria-busy="true" className={`${cardClassName} motion-safe:animate-pulse`}>
        <span className="sr-only">{t("performance.loading")}</span>
        <div className="h-14 rounded-[10px] bg-strip" />
      </div>
    );
  }

  if (failed || !analytics) {
    return (
      <div className={cardClassName}>
        <ErrorState message={t("performance.error")} onRetry={onRetry} />
      </div>
    );
  }

  if (!hasGradedPeriods && !hasPoints) {
    return (
      <div className={cardClassName}>
        <EmptyState title={t("performance.emptyTitle")} description={t("performance.emptyHelp")} />
      </div>
    );
  }

  return (
    <div className={`${cardClassName} flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span>{t("performance.pointsLabel")}</span>
        <InfoTooltip label={t("performance.pointsHelp")}>
          <span>{t("performance.pointsHelp")}</span>
          {profile.avg_score_summary_count > 0 && (
            <span className="mt-1 block text-xs text-muted">{basisText}</span>
          )}
        </InfoTooltip>
      </div>
      <span className="text-2xl font-semibold tabular-nums text-ink">{pointsValue}</span>
    </div>
  );
}
