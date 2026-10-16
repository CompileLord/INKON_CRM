import { useTranslation } from "react-i18next";
import { BookOpenCheck, CalendarCheck, GraduationCap, Sparkles, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import { InfoTooltip } from "../ui/InfoTooltip";
import type { JournalEmbeddedSummary } from "../../lib/journals/types";

interface PeriodScoreSummaryProps {
  summary: JournalEmbeddedSummary | null;
  rank: number | undefined;
  classSize: number | undefined;
  classAveragePercentage: number | undefined;
}

interface Contribution {
  key: "homework" | "attendance" | "exam" | "bonus";
  value: number;
  icon: ReactNode;
  barClass: string;
}

export function PeriodScoreSummary({ summary, rank, classSize, classAveragePercentage }: PeriodScoreSummaryProps) {
  const { t } = useTranslation(["student", "journals"]);

  if (!summary) {
    return (
      <section aria-labelledby="period-result-heading" className="rounded-2xl border border-border-warm bg-card p-4 lg:p-5" data-testid="period-summary-empty">
        <h2 id="period-result-heading" className="text-lg font-semibold leading-7 text-ink">{t("totalScore")}</h2>
        <p className="mt-1 text-sm text-muted">{t("recordedResultMissing")}</p>
      </section>
    );
  }

  const contributions: Contribution[] = [
    { key: "homework", value: summary.homework_score, icon: <BookOpenCheck className="h-4 w-4" />, barClass: "bg-series-1" },
    { key: "attendance", value: summary.attendance_score, icon: <CalendarCheck className="h-4 w-4" />, barClass: "bg-series-3" },
    { key: "exam", value: summary.exam_score, icon: <GraduationCap className="h-4 w-4" />, barClass: "bg-series-4" },
    { key: "bonus", value: summary.bonus_score, icon: <Sparkles className="h-4 w-4" />, barClass: "bg-series-7" },
  ];
  const hasMaximum: boolean = summary.max_period_score > 0;
  const barDenominator: number = Math.max(summary.max_period_score, summary.sum_score, 1);

  return (
    <section aria-labelledby="period-result-heading" className="flex flex-col gap-4 rounded-2xl border border-border-warm bg-card p-4 lg:p-5" data-testid="period-summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 id="period-result-heading" className="text-sm font-medium text-muted">{t("totalScore")}</h2>
            <InfoTooltip label={t("howCalculated")}>{t("howCalculatedExplanation")}</InfoTooltip>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="text-4xl font-semibold leading-10 text-ink" data-testid="period-total">{formatNumber(summary.sum_score)}</span>
            {hasMaximum && <span className="text-lg text-muted" data-testid="period-maximum">/ {formatNumber(summary.max_period_score)}</span>}
            <span className="text-sm text-muted">{t("pointsUnit")}</span>
            {hasMaximum && <span className="text-sm font-medium text-muted" data-testid="period-percentage">{formatPercentage(summary.percentage)}</span>}
          </p>
        </div>
        {rank !== undefined && classSize !== undefined && classSize > 0 && (
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-info-surface px-3 text-sm font-semibold tabular-nums text-ink" data-testid="period-rank">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            {t("rankValue", { rank, size: classSize })}
            {classAveragePercentage !== undefined && (
              <InfoTooltip label={t("rankInfoLabel")}>{t("rankInfo", { average: formatNumber(classAveragePercentage, undefined, { maximumFractionDigits: 1 }) })}</InfoTooltip>
            )}
          </span>
        )}
      </div>

      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-strip" role="img" aria-label={t("breakdownLabel")}>
        {contributions.map((item) =>
          item.value > 0 ? (
            <div key={item.key} className={`h-full ${item.barClass}`} style={{ width: `${(item.value / barDenominator) * 100}%` }} />
          ) : null,
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4" data-testid="period-contributions">
        {contributions.map((item) => (
          <div key={item.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-md bg-beige text-ink">{item.icon}</span>
              {t(item.key)}
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-ink" data-testid={`contribution-${item.key}`}>{formatNumber(item.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
