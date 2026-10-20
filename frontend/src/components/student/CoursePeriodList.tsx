import { useTranslation } from "react-i18next";
import type { StudentJournalPeriod } from "../../lib/users/types";
import { StudentPeriodOrdering } from "../../lib/students/StudentPeriodOrdering";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { ListRow } from "../ui/ListRow";
import { usePeriodName } from "../ui/periodName";
import { ScoreFraction } from "./ScoreFraction";

interface CoursePeriodListProps {
  periods: StudentJournalPeriod[];
}

export function CoursePeriodList({ periods }: CoursePeriodListProps) {
  const { t } = useTranslation("student");
  const periodName: (label: string) => string = usePeriodName();
  const ordered: StudentJournalPeriod[] = StudentPeriodOrdering.order(periods);

  return (
    <ul className="flex flex-col" data-testid="period-list">
      {ordered.map((period: StudentJournalPeriod) => {
        const upcoming: boolean = period.state === "upcoming";
        const inProgress: boolean = period.state === "in_progress";
        const content = (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="flex min-w-0 flex-col">
              <span className={`break-words text-sm font-medium ${upcoming ? "text-muted" : "text-ink"}`}>{periodName(period.period_label)}</span>
              <span className="text-sm tabular-nums text-muted">
                {formatSchoolLessonDate(period.period_start)} – {formatSchoolLessonDate(period.period_end)}
              </span>
            </span>
            <span className="text-sm" data-testid={upcoming || inProgress ? undefined : "period-score"}>
              {upcoming ? (
                <span className="text-muted">{t("state.upcoming")}</span>
              ) : inProgress ? (
                <span className="text-muted">{t("state.in_progress")}</span>
              ) : (
                <ScoreFraction score={period.sum_score} maximum={period.max_period_score} />
              )}
            </span>
          </div>
        );
        return (
          <li key={period.journal_id}>
            {upcoming ? (
              <div className="rounded-[10px] px-3 py-2" data-testid="period-row-upcoming">
                <div className="py-1">{content}</div>
              </div>
            ) : (
              <ListRow to={`/my/journal/${period.journal_id}`}>{content}</ListRow>
            )}
          </li>
        );
      })}
    </ul>
  );
}
