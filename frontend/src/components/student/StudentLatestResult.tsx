import { useTranslation } from "react-i18next";
import type { StudentJournalPeriod } from "../../lib/users/types";
import { formatNumber, formatSchoolLessonDate } from "../../i18n/formatters";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";
import { usePeriodName } from "../ui/periodName";
import { ListRow } from "../ui/ListRow";
import { StaleNotice } from "../pane/PaneStates";
import { ScoreFraction } from "./ScoreFraction";

interface StudentLatestResultProps {
  journal: StudentJournalPeriod | undefined;
  hasLoadedData: boolean;
  hasUpcomingPeriods: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface ContributionLine {
  key: "homework" | "attendance" | "exam" | "bonus";
  value: number | undefined;
}

function LatestResultSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4 motion-safe:animate-pulse">
      <span className="sr-only">{t("loading")}</span>
      <div className="h-5 w-40 rounded bg-strip" />
      <div className="h-9 w-32 rounded bg-strip" />
      <div className="h-20 rounded bg-strip" />
    </div>
  );
}

export function StudentLatestResult({ journal, hasLoadedData, hasUpcomingPeriods, isLoading, isError, onRetry }: StudentLatestResultProps) {
  const { t } = useTranslation("student");
  const periodName: (label: string) => string = usePeriodName();

  let body;
  if (!hasLoadedData && isLoading) body = <LatestResultSkeleton />;
  else if (!hasLoadedData && isError) body = <ErrorState message={t("journalsRefreshError")} onRetry={onRetry} />;
  else if (!journal) {
    body = (
      <EmptyState
        title={t(hasUpcomingPeriods ? "upcomingPeriodsTitle" : "noAvailablePeriodsTitle")}
        description={t(hasUpcomingPeriods ? "upcomingPeriodsBody" : "noAvailablePeriodsBody")}
      />
    );
  } else {
    const contributions: ContributionLine[] = [
      { key: "homework", value: journal.homework_score },
      { key: "attendance", value: journal.attendance_score },
      { key: "exam", value: journal.exam_score },
      { key: "bonus", value: journal.bonus_score },
    ];
    body = (
      <div className="flex flex-col gap-4">
        <ListRow to={`/my/journal/${journal.journal_id}`}>
          <div className="flex flex-col gap-1">
            <span className="break-words text-sm font-medium text-ink">{journal.course_title}</span>
            <span className="text-sm text-muted">
              {periodName(journal.period_label)} · <span className="tabular-nums">{formatSchoolLessonDate(journal.period_start)} – {formatSchoolLessonDate(journal.period_end)}</span>
            </span>
            <span className="mt-1 text-3xl" data-testid="latest-result-score">
              <ScoreFraction score={journal.sum_score} maximum={journal.max_period_score} showPercentage />
            </span>
          </div>
        </ListRow>
        <dl className="flex flex-col divide-y divide-border border-t border-border">
          {contributions.map((line: ContributionLine) => (
            <div key={line.key} className="flex items-baseline justify-between gap-4 py-2 text-sm">
              <dt className="text-muted">{t(line.key)}</dt>
              <dd className="tabular-nums text-ink">{line.value === undefined ? t("metricUnavailable") : formatNumber(line.value, undefined, { maximumFractionDigits: 1 })}</dd>
            </div>
          ))}
        </dl>
        {isError && <StaleNotice message={t("journalsRefreshError")} onRetry={onRetry} />}
      </div>
    );
  }

  return (
    <SectionCard title={t("latestPeriodResult")} info={t("howCalculatedExplanation")}>
      {body}
    </SectionCard>
  );
}
