import { useTranslation } from "react-i18next";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
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

interface FactProps {
  label: string;
  value: string;
  explanation: string;
}

function Fact({ label, value, explanation }: FactProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="m-0 flex flex-col gap-0.5">
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        <span className="text-sm text-muted">{explanation}</span>
      </dd>
    </div>
  );
}

export function MentorPerformance({ profile, analytics, loading, failed, onRetry }: MentorPerformanceProps) {
  const { t, i18n } = useTranslation("mentorProfile");
  const points = (value: number): string => formatNumber(value, i18n.language, { maximumFractionDigits: 1 });
  const share: number | null | undefined = profile.avg_score_defined_ratios_mean;
  const hasGradedPeriods: boolean = profile.avg_score_defined_ratio_count > 0;
  const hasPoints: boolean = analytics !== undefined && analytics.average_student_score_summary_count > 0;

  return (
    <SectionCard title={t("performance.title")} info={t("performance.formula")}>
      {loading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <span className="sr-only">{t("performance.loading")}</span>
          {[0, 1, 2].map((row: number) => <div key={row} className="h-16 rounded-[10px] bg-strip" />)}
        </div>
      ) : failed || !analytics ? (
        <ErrorState message={t("performance.error")} onRetry={onRetry} />
      ) : !hasGradedPeriods && !hasPoints ? (
        <EmptyState title={t("performance.emptyTitle")} description={t("performance.emptyHelp")} />
      ) : (
        <dl className="grid gap-6 md:grid-cols-3">
          <Fact
            label={t("performance.pointsLabel")}
            value={hasPoints ? points(analytics.average_student_score) : "—"}
            explanation={t("performance.pointsHelp")}
          />
          <Fact
            label={t("performance.shareLabel")}
            value={ScoreFormat.shareLabel(share, i18n.language) ?? "—"}
            explanation={t("performance.shareHelp")}
          />
          <Fact
            label={t("performance.studentsLabel")}
            value={formatNumber(analytics.total_students_count, i18n.language)}
            explanation={t("performance.studentsHelp")}
          />
        </dl>
      )}
      {!loading && !failed && analytics && (hasGradedPeriods || hasPoints) ? (
        <p className="text-sm text-muted">{t("performance.basis", { count: profile.avg_score_summary_count, formatted: formatNumber(profile.avg_score_summary_count, i18n.language) })}</p>
      ) : null}
    </SectionCard>
  );
}
