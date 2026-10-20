import { useTranslation } from "react-i18next";
import { formatSchoolLessonDate, formatSchoolLessonWeekday } from "../../i18n/formatters";
import { JournalScoringRules } from "../../lib/journals/JournalScoringRules";
import type { JournalEntryResponse } from "../../lib/journals/types";
import { EmptyState } from "../ui/EmptyState";
import { SectionCard } from "../ui/SectionCard";

interface StudentLessonRecordsProps {
  lessonDates: string[];
  entries: JournalEntryResponse[];
}

export function StudentLessonRecords({ lessonDates, entries }: StudentLessonRecordsProps) {
  const { t } = useTranslation(["student", "journals"]);
  const entryByDate: Map<string, JournalEntryResponse> = new Map(entries.map((entry: JournalEntryResponse) => [entry.lesson_date, entry]));

  return (
    <SectionCard title={t("student:lessonsTitle")}>
      {lessonDates.length === 0 ? (
        <EmptyState title={t("journals:grid.noLessonsTitle")} description={t("journals:grid.noLessonsBody")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border" data-testid="lesson-records">
          {lessonDates.map((lessonDate: string) => {
            const entry: JournalEntryResponse | undefined = entryByDate.get(lessonDate);
            return (
              <li key={lessonDate} data-lesson-date={lessonDate} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3 text-sm">
                <span className="tabular-nums text-ink">
                  <span className="text-muted">{formatSchoolLessonWeekday(lessonDate)}</span> {formatSchoolLessonDate(lessonDate)}
                </span>
                {entry === undefined ? (
                  <span className="text-muted">{t("journals:table.notRecorded")}</span>
                ) : (
                  <span className="flex items-baseline gap-3">
                    <span className={entry.attendance ? "text-ink" : "text-muted"}>
                      {entry.attendance ? t("journals:table.present") : t("journals:table.absent")}
                    </span>
                    {entry.attendance && (
                      <span className="tabular-nums" data-testid="lesson-score">
                        <span className="font-semibold text-ink">{entry.score}</span>
                        <span className="text-muted"> / {JournalScoringRules.MAXIMUM_HOMEWORK_PER_LESSON}</span>
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
