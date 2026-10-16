import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { StudentJournalPeriod } from "../../lib/users/types";
import { StudentPeriodOrdering } from "../../lib/students/StudentPeriodOrdering";
import { ScoreBand } from "../../lib/students/ScoreBand";
import { formatNumber, formatSchoolLessonDate } from "../../i18n/formatters";

interface CoursePeriodListProps {
  periods: StudentJournalPeriod[];
}

export function CoursePeriodList({ periods }: CoursePeriodListProps) {
  const { t, i18n } = useTranslation("student");
  const ordered: StudentJournalPeriod[] = StudentPeriodOrdering.order(periods);
  const latestId: number | undefined = ordered.find((period) => period.state !== "upcoming")?.journal_id;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border-warm bg-card" data-testid="period-list">
      {ordered.map((period) => {
        const upcoming: boolean = period.state === "upcoming";
        const band = ScoreBand.of(period.percentage);
        const range: string = `${formatSchoolLessonDate(period.period_start, i18n.language)} – ${formatSchoolLessonDate(period.period_end, i18n.language)}`;
        const content = (
          <>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`break-words text-sm font-semibold ${upcoming ? "text-muted" : "text-ink"}`}>{period.period_label}</span>
                {period.journal_id === latestId && (
                  <span className="rounded-full bg-info-surface px-2 text-xs font-semibold text-ink" data-testid="latest-period-chip">
                    {t("latestBadge")}
                  </span>
                )}
              </span>
              <span className="text-xs tabular-nums text-muted">{range}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {upcoming ? (
                <span className="rounded-full bg-strip px-2.5 py-1 text-xs font-medium text-muted">{t("state.upcoming")}</span>
              ) : period.state === "in_progress" ? (
                <span className="rounded-full bg-strip px-2.5 py-1 text-xs font-medium text-muted">{t("state.in_progress")}</span>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${band.chipClass}`}
                  data-testid="period-score-chip"
                  data-band={band.name}
                >
                  {formatNumber(period.percentage, i18n.language, { maximumFractionDigits: 0 })}%
                </span>
              )}
              {!upcoming && <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted" />}
            </span>
          </>
        );
        return (
          <li key={period.journal_id}>
            {upcoming ? (
              <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3" data-testid="period-row-upcoming">
                {content}
              </div>
            ) : (
              <Link
                to={`/my/journal/${period.journal_id}`}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
