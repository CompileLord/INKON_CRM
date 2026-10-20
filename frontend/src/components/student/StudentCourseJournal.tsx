import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourseJournals } from "../../lib/courses/hooks";
import { useScopedJournal } from "../../lib/journals/hooks";
import { JournalWorkspaceSelection } from "../../lib/journals/JournalWorkspaceSelection";
import { getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalGrid } from "../journals/JournalGrid";
import { JournalPeriodSelect } from "../journals/JournalPeriodSelect";
import { JournalGridSkeleton, JournalNotice, JournalPanelMessage, JournalPeriodBarSkeleton } from "../journals/JournalWorkspaceStates";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalPeriod } from "../../lib/courses/types";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface StudentCourseJournalProps {
  courseId: number;
  selfStudentId: number;
}

const NO_STATUS: Map<string, CellSaveStatus> = new Map();
const NO_SUMMARY_STATUS: Map<number, CellSaveStatus> = new Map();
const IGNORE_LESSON_SELECTION = (): void => undefined;

export function StudentCourseJournal({ courseId, selfStudentId }: StudentCourseJournalProps) {
  const { t } = useTranslation(["journals", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const today: string = getSchoolCalendarDate();
  const periodsQuery = useCourseJournals(courseId);
  const periods: JournalPeriod[] | undefined = periodsQuery.data;
  const selected: JournalPeriod | undefined = JournalWorkspaceSelection.resolvePeriod(periods ?? [], searchParams.get("period"), today).period;
  const journalQuery = useScopedJournal(selected?.id, "student");
  const journal = journalQuery.data;
  const lessonSelection = JournalWorkspaceSelection.resolveLesson(journal?.lesson_dates ?? [], searchParams.get("lesson"), today);

  const selectPeriod = (periodId: number): void =>
    setSearchParams((previous: URLSearchParams) => {
      const next: URLSearchParams = new URLSearchParams(previous);
      next.set("period", String(periodId));
      next.delete("lesson");
      return next;
    }, { replace: true });
  const selectLesson = (lessonDate: string): void =>
    setSearchParams((previous: URLSearchParams) => {
      const next: URLSearchParams = new URLSearchParams(previous);
      next.set("lesson", lessonDate);
      return next;
    }, { replace: true });

  if (periodsQuery.isLoading) return <JournalPeriodBarSkeleton />;
  if (periodsQuery.isError && !periods) {
    return <JournalPanelMessage tone="error" title={t("workspace.periodsLoadFailed")} retryLabel={t("common:retry")} onRetry={() => void periodsQuery.refetch()} />;
  }
  if (!periods || periods.length === 0 || !selected) {
    return <JournalPanelMessage tone="empty" title={t("workspace.noPeriodsTitle")} body={t("workspace.noPeriodsBody")} />;
  }

  const renderBody = () => {
    if (journalQuery.isLoading) return <JournalGridSkeleton />;
    if (journalQuery.isError && !journal) {
      return <JournalPanelMessage tone="error" title={t("loadFailed")} retryLabel={t("common:retry")} onRetry={() => void journalQuery.refetch()} />;
    }
    if (!journal) return null;
    if (journal.lesson_dates.length === 0) return <JournalPanelMessage tone="empty" title={t("grid.noLessonsTitle")} body={t("grid.noLessonsBody")} />;
    const students: JournalStudentResponse[] = journal.students;
    return (
      <div className="flex min-w-0 flex-col gap-3" data-testid="student-journal-grid">
        {journalQuery.isError && (
          <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void journalQuery.refetch() }}>{t("grid.refreshFailed")}</JournalNotice>
        )}
        <JournalGrid
          key={journal.journal_id}
          journalId={journal.journal_id}
          periodLabel={journal.period_label}
          students={students}
          lessonDates={JournalWorkspaceSelection.orderLessonDates(journal.lesson_dates)}
          selectedLesson={lessonSelection.lesson}
          cellStatus={NO_STATUS}
          summaryStatus={NO_SUMMARY_STATUS}
          editing={null}
          examMaximum={journal.exam_max_score}
          bonusMaximum={journal.bonus_max_score}
          onSelectLesson={journalQuery.isPlaceholderData ? IGNORE_LESSON_SELECTION : selectLesson}
          readOnlySelfStudentId={selfStudentId}
        />
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <JournalPeriodSelect periods={periods} selectedPeriodId={selected.id} today={today} onSelect={selectPeriod} showPastStatus />
      {renderBody()}
    </div>
  );
}
