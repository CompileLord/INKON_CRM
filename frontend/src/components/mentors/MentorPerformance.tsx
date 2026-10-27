import { useTranslation } from "react-i18next";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { SectionCard } from "../ui/SectionCard";
import { ScoreFormat } from "../profile/ScoreFormat";
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
  const share: number | null | undefined = profile.avg_score_defined_ratios_mean;
  const hasGradedPeriods: boolean = profile.avg_score_defined_ratio_count > 0;
  const hasPoints: boolean = analytics !== undefined && analytics.average_student_score_summary_count > 0;
  const shareValue: number = typeof share === "number" ? share : 0;
  const shareLabelText: string = ScoreFormat.shareLabel(share, i18n.language) ?? "—";
  const pointsValue: string = hasPoints && analytics !== undefined ? points(analytics.average_student_score) : "—";
  const basisText: string = t("performance.basis", {
    count: profile.avg_score_summary_count,
    formatted: formatNumber(profile.avg_score_summary_count, i18n.language),
  });

  return (
    <SectionCard title={t("performance.title")} info={t("performance.formula")}>
      {loading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <span className="sr-only">{t("performance.loading")}</span>
          {[0, 1].map((row: number) => <div key={row} className="h-14 rounded-[10px] bg-strip" />)}
        </div>
      ) : failed || !analytics ? (
        <ErrorState message={t("performance.error")} onRetry={onRetry} />
      ) : !hasGradedPeriods && !hasPoints ? (
        <EmptyState title={t("performance.emptyTitle")} description={t("performance.emptyHelp")} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <span>{t("performance.pointsLabel")}</span>
              <InfoTooltip label={t("performance.pointsHelp")}>
                <span>{t("performance.pointsHelp")}</span>
                {profile.avg_score_summary_count > 0 && (
                  <span className="mt-1 block text-xs text-muted">
                    {basisText}
                  </span>
                )}
              </InfoTooltip>
            </div>
            <span className="text-2xl font-semibold tabular-nums text-ink">{pointsValue}</span>
          </div>

          <div className="flex flex-col justify-center gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted">
                <span>{t("performance.shareLabel")}</span>
                <InfoTooltip label={t("performance.shareHelp")}>{t("performance.shareHelp")}</InfoTooltip>
              </span>
              <span className="font-semibold tabular-nums text-ink">{shareLabelText}</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={shareValue}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("performance.shareLabel")}
              className="h-2 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full rounded-full bg-maroon motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out"
                style={{ width: `${Math.min(Math.max(shareValue, 0), 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
