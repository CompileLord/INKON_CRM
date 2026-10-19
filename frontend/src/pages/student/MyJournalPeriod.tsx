import { useCallback, useId, useRef } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Eye } from "lucide-react";
import { useCourse, useCourseJournals } from "../../lib/courses/hooks";
import { useScopedJournal } from "../../lib/journals/hooks";
import { useJournalWorkspaceRoute } from "../../lib/journals/useJournalWorkspaceRoute";
import { JournalWorkspaceSelection } from "../../lib/journals/JournalWorkspaceSelection";
import { useAuthStore } from "../../store/authStore";
import { formatSchoolLessonDate, getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { JournalGrid } from "../../components/journals/JournalGrid";
import { JournalLessonView } from "../../components/journals/JournalLessonView";
import { JournalLessonNavigator } from "../../components/journals/JournalLessonNavigator";
import { JournalPeriodPicker } from "../../components/journals/JournalPeriodPicker";
import { JournalProgressView } from "../../components/journals/JournalProgressView";
import { JournalWorkspaceTabs } from "../../components/journals/JournalWorkspaceTabs";
import {
  JournalContextSkeleton,
  JournalGridSkeleton,
  JournalLessonSkeleton,
  JournalNotice,
  JournalPanelMessage,
  JournalPeriodBarSkeleton,
} from "../../components/journals/JournalWorkspaceStates";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { useDesktop } from "../../components/shell/useDesktop";
import { OwnLessonNotes } from "../../components/student/OwnLessonNotes";
import { PeriodScoreSummary } from "../../components/student/PeriodScoreSummary";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

function parseJournalId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

const NO_ANCHOR = (): void => undefined;
const NO_CELL_STATUS: Map<string, CellSaveStatus> = new Map();
const NO_SUMMARY_STATUS: Map<number, CellSaveStatus> = new Map();

export function MyJournalPeriod() {
  const { journalId: rawJournalId } = useParams<{ journalId: string }>();
  const journalId: number | undefined = parseJournalId(rawJournalId);
  const { t } = useTranslation(["student", "journals", "common"]);
  const navigate = useNavigate();
  const isDesktop: boolean = useDesktop();
  const userId: number | null = useAuthStore((state) => state.userId);
  const panelIdPrefix: string = useId();
  const lessonHeadingRef = useRef<HTMLHeadingElement>(null);
  const today: string = getSchoolCalendarDate();

  const initialQuery = useScopedJournal(journalId, "student");
  const courseId: number | undefined = initialQuery.data?.course_id;
  const { data: course } = useCourse(courseId);
  const periodsQuery = useCourseJournals(courseId);

  const openPeriod = useCallback((periodId: number): void => navigate(`/my/journal/${periodId}`), [navigate]);
  const route = useJournalWorkspaceRoute({
    periods: periodsQuery.data,
    today,
    studentScope: journalId === undefined ? undefined : { journalId, openPeriod },
  });
  const journal = route.journalQuery.data;
  const selfRecord: JournalStudentResponse | undefined = journal?.students.find((student) => student.is_self === true);
  const lessonSelection = route.lessonResolution;

  const backHref: string = courseId !== undefined ? `/my/courses/${courseId}` : "/my/courses";
  const backLink = <PageHeader backTo={backHref} backLabel={course ? course.title : t("backToCourses")} />;

  if (journalId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage tone="empty" title={t("journalNotFoundTitle")} body={t("journalNotFoundBody")} />
      </div>
    );
  }
  if (initialQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalContextSkeleton />
      </div>
    );
  }
  const denial = initialQuery.isError && !journal ? JournalRouteErrors.denialOf(initialQuery.error) : null;
  if (denial) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage
          tone="empty"
          title={denial === "forbidden" ? t("courseForbiddenTitle") : t("journalNotFoundTitle")}
          body={denial === "forbidden" ? t("courseForbiddenBody") : t("journalNotFoundBody")}
        />
      </div>
    );
  }
  if (initialQuery.isError && !journal) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage tone="error" title={t("journalLoadFailed")} retryLabel={t("common:retry")} onRetry={() => void initialQuery.refetch()} />
      </div>
    );
  }
  if (!journal || userId === null) return null;

  const periods = periodsQuery.data;
  const lessonDates: string[] = JournalWorkspaceSelection.orderLessonDates(journal.lesson_dates);

  const renderGradebookBody = () => {
    if (lessonDates.length === 0) {
      return <JournalPanelMessage tone="empty" title={t("journals:grid.noLessonsTitle")} body={t("journals:grid.noLessonsBody")} />;
    }
    return isDesktop || !lessonSelection.lesson ? (
      <JournalGrid
        key={journal.journal_id}
        journalId={journal.journal_id}
        periodLabel={journal.period_label}
        students={journal.students}
        lessonDates={lessonDates}
        selectedLesson={lessonSelection.lesson}
        cellStatus={NO_CELL_STATUS}
        summaryStatus={NO_SUMMARY_STATUS}
        editing={null}
        onSelectLesson={route.selectLesson}
        readOnlySelfStudentId={userId}
      />
    ) : (
      <JournalLessonView
        students={journal.students}
        visibleStudentIds={null}
        lessonDate={lessonSelection.lesson}
        periodLabel={journal.period_label}
        cellStatus={NO_CELL_STATUS}
        editing={null}
        searchQuery=""
        onClearSearch={NO_ANCHOR}
        onAnchor={NO_ANCHOR}
        headingRef={lessonHeadingRef}
        readOnlySelfStudentId={userId}
      />
    );
  };

  const renderGradebook = () => {
    if (route.journalQuery.isPlaceholderData) return isDesktop ? <JournalGridSkeleton /> : <JournalLessonSkeleton />;
    return (
      <>
        {route.journalQuery.isError && (
          <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void route.journalQuery.refetch() }}>
            {t("journals:grid.refreshFailed")}
          </JournalNotice>
        )}
        {renderGradebookBody()}
      </>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
      <PageHeader backTo={backHref} backLabel={course ? course.title : t("backToCourses")} title={journal.period_label}>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatSchoolLessonDate(journal.period_start)} – {formatSchoolLessonDate(journal.period_end)}
          </span>
          <span className="inline-flex items-center gap-1.5" data-testid="read-only-badge">
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t("readOnlyBadge")}
            <InfoTooltip label={t("readOnlyInfoLabel")}>{t("readOnlyInfo")}</InfoTooltip>
          </span>
        </p>
      </PageHeader>

      {periodsQuery.isLoading ? (
        <JournalPeriodBarSkeleton />
      ) : periodsQuery.isError && !periods ? (
        <JournalPanelMessage tone="error" title={t("journals:workspace.periodsLoadFailed")} retryLabel={t("common:retry")} onRetry={() => void periodsQuery.refetch()} />
      ) : periods && periods.length > 0 ? (
        <div className="w-full lg:w-fit">
          <JournalPeriodPicker periods={periods} selectedPeriodId={journalId} today={today} onSelect={route.selectPeriod} />
        </div>
      ) : null}

      <PeriodScoreSummary
        summary={selfRecord?.summary ?? null}
        rank={journal.my_rank}
        classSize={journal.class_size}
        classAveragePercentage={journal.class_avg_percentage}
      />

      <JournalWorkspaceTabs selected={route.tab} onSelect={route.selectTab} idPrefix={panelIdPrefix} />

      {route.tab === "gradebook" ? (
        <section
          role="tabpanel"
          id={`${panelIdPrefix}-panel-gradebook`}
          aria-labelledby={`${panelIdPrefix}-tab-gradebook`}
          className="flex min-w-0 flex-col gap-3"
        >
          {lessonDates.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <JournalLessonNavigator lessonDates={lessonDates} selectedLesson={lessonSelection.lesson} today={today} onSelect={route.selectLesson} />
            </div>
          )}
          {renderGradebook()}
        </section>
      ) : (
        <section
          role="tabpanel"
          id={`${panelIdPrefix}-panel-progress`}
          aria-labelledby={`${panelIdPrefix}-tab-progress`}
          className="flex min-w-0 flex-col gap-4"
        >
          {courseId !== undefined && <JournalProgressView courseId={courseId} readOnlySelfStudentId={userId} />}
        </section>
      )}

      {selfRecord && <OwnLessonNotes entries={selfRecord.entries} />}
    </div>
  );
}
