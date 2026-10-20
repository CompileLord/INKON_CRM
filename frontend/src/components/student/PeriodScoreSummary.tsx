import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";
import type { JournalEmbeddedSummary } from "../../lib/journals/types";
import { ScoreFraction } from "./ScoreFraction";

interface PeriodScoreSummaryProps {
  summary: JournalEmbeddedSummary | null;
}

interface Contribution {
  key: "homework" | "attendance" | "exam" | "bonus";
  value: number;
}

export function PeriodScoreSummary({ summary }: PeriodScoreSummaryProps) {
  const { t } = useTranslation("student");

  if (!summary) {
    return (
      <div data-testid="period-summary-empty">
        <SectionCard title={t("totalScore")}>
          <EmptyState title={t("recordedResultMissing")} />
        </SectionCard>
      </div>
    );
  }

  const contributions: Contribution[] = [
    { key: "homework", value: summary.homework_score },
    { key: "attendance", value: summary.attendance_score },
    { key: "exam", value: summary.exam_score },
    { key: "bonus", value: summary.bonus_score },
  ];

  return (
    <div data-testid="period-summary">
      <SectionCard title={t("totalScore")} info={t("howCalculatedExplanation")}>
        <p className="text-4xl" data-testid="period-total">
          <ScoreFraction score={summary.sum_score} maximum={summary.max_period_score} showPercentage />
        </p>
        <dl className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-[10px] border border-border sm:grid-cols-4 sm:divide-y-0" data-testid="period-contributions">
          {contributions.map((item: Contribution) => (
            <div key={item.key} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
              <dt className="text-sm text-muted">{t(item.key)}</dt>
              <dd className="text-lg font-semibold tabular-nums text-ink" data-testid={`contribution-${item.key}`}>
                {formatNumber(item.value, undefined, { maximumFractionDigits: 1 })}
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
