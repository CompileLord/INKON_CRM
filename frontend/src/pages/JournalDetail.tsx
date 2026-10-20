import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourse, useCourseJournals } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { useCourseEnrollmentsCount } from "../lib/enrollments/hooks";
import { useAuthStore } from "../store/authStore";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { usePeriodName } from "../components/ui/periodName";
import { JournalProgressView } from "../components/journals/JournalProgressView";
import { JournalGrid } from "../components/journals/JournalGrid";
import { JournalPeriodMenu } from "../components/journals/JournalPeriodMenu";
import { JournalPeriodSelect } from "../components/journals/JournalPeriodSelect";
import { JournalPeriodTransition } from "../components/journals/JournalPeriodTransition";
import { JournalRosterSearch } from "../components/journals/JournalRosterSearch";
import { JournalKeyboardHelp } from "../components/journals/JournalKeyboardHelp";
import { JournalRouteErrors } from "../components/journals/JournalRouteErrors";
import { JournalSaveStatus } from "../components/journals/JournalSaveStatus";
import { JournalConflictReview } from "../components/journals/JournalConflictReview";
import { JournalDrainDialog } from "../components/journals/JournalDrainDialog";
import { JournalPeriodSettingsDialog } from "../components/journals/JournalPeriodSettingsDialog";
import type { JournalRowEditing } from "../components/journals/JournalStudentRow";
import {
  JournalContextSkeleton,
  JournalGridSkeleton,
  JournalNotice,
  JournalPanelMessage,
  JournalPeriodBarSkeleton,
} from "../components/journals/JournalWorkspaceStates";
import { JournalQueueProvider } from "../lib/journals/JournalQueueProvider";
import { useJournalQueueRegistry } from "../lib/journals/journalQueueContext";
import { useJournalQueueStatus } from "../lib/journals/useJournalQueueStatus";
import { useJournalNavigationGuard } from "../lib/journals/useJournalNavigationGuard";
import { useJournalAutosave } from "../lib/journals/useJournalAutosave";
import { useUpdateJournalExamMaxScore } from "../lib/journals/hooks";
import { JournalWorkspaceSelection } from "../lib/journals/JournalWorkspaceSelection";
import { JournalPeriodSettingsRules } from "../lib/journals/JournalPeriodSettingsRules";
import { JournalScoringRules } from "../lib/journals/JournalScoringRules";
import type { JournalExamMaxScoreUpdate } from "../lib/journals/types";
import { JournalRosterFilter } from "../lib/journals/JournalRosterFilter";
import { useStableStudentOrder } from "../lib/journals/JournalStudentOrdering";
import { useJournalWorkspaceRoute } from "../lib/journals/useJournalWorkspaceRoute";
import { formatSchoolLessonDate, getSchoolCalendarDate } from "../i18n/formatters";

export function JournalDetail() {
  return (
    <JournalQueueProvider>
      <JournalDetailContent />
    </JournalQueueProvider>
  );
}

function JournalDetailContent() {
  const { t } = useTranslation(["journals", "common"]);
  const periodName: (label: string) => string = usePeriodName();
  const registry = useJournalQueueRegistry();
  const queueStatus = useJournalQueueStatus();
  const navigationGuard = useJournalNavigationGuard(JournalWorkspaceSelection.changesJournalContext);
  const role = useAuthStore((state) => state.role);
  const [reviewOpen, setReviewOpen] = useState<boolean>(false);
  const [settingsJournalId, setSettingsJournalId] = useState<number | null>(null);
  const [settingsBusy, setSettingsBusy] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  if (reviewOpen && queueStatus.conflicts.length === 0) setReviewOpen(false);

  const { id: rawCourseId } = useParams<{ id: string }>();
  const courseId: number | undefined = JournalWorkspaceSelection.parseCourseId(rawCourseId);
  const today: string = getSchoolCalendarDate();

  const { data: course, isLoading: courseLoading, isError: courseError, error: courseFailure, refetch: refetchCourse } = useCourse(courseId);
  const mentorQuery = useMentorProfile(course?.mentor_id);
  const { data: rosterCount } = useCourseEnrollmentsCount(courseId);
  const {
    data: periods,
    isLoading: periodsLoading,
    isError: periodsError,
    refetch: refetchPeriods,
  } = useCourseJournals(courseId);

  const route = useJournalWorkspaceRoute({ periods, today });
  const selectedPeriod = route.periodResolution.period;
  const journalId: number | undefined = selectedPeriod?.id;
  if (settingsJournalId !== null && settingsJournalId !== journalId) setSettingsJournalId(null);
  const settingsOpen: boolean = settingsJournalId !== null && settingsJournalId === journalId;
  const { journalQuery } = route;
  const journal = journalQuery.data;

  const isArchivedForMentor: boolean = role === "mentor" && course?.status === "archived";
  const canEditByRole: boolean = role === "superadmin" || role === "mentor";
  const autosave = useJournalAutosave(canEditByRole && !isArchivedForMentor ? journalId : undefined, courseId);
  const updateExamMaxScore = useUpdateJournalExamMaxScore(journalId, courseId);

  const orderedStudents = useStableStudentOrder(journal?.journal_id ?? 0, journal?.students ?? []);
  const visibleStudentIds: Set<number> | null = JournalRosterFilter.visibleIds(orderedStudents, searchQuery);
  const isFiltering: boolean = visibleStudentIds !== null;
  const matchedCount: number = visibleStudentIds ? visibleStudentIds.size : orderedStudents.length;
  const rosterSearchVisible: boolean = orderedStudents.length > 0;
  const isSwitchingPeriod: boolean = journalQuery.isPlaceholderData;
  const editorsMounted: boolean = canEditByRole && !isArchivedForMentor && !queueStatus.forbidden && !isSwitchingPeriod;
  const { applyEntryCommand, editSummary } = autosave;
  const editing: JournalRowEditing | null = useMemo(
    () => (editorsMounted && !settingsBusy ? { onEntryCommand: applyEntryCommand, onSummaryPair: editSummary } : null),
    [editorsMounted, settingsBusy, applyEntryCommand, editSummary],
  );

  const backLink = <PageHeader title={t("title")} backTo="/journals" backLabel={t("backToJournals")} />;

  if (courseId === undefined) {
    return (
      <PageContainer>
        {backLink}
        <JournalPanelMessage tone="empty" title={t("notFound")} />
      </PageContainer>
    );
  }

  if (courseLoading) {
    return (
      <PageContainer>
        {backLink}
        <JournalContextSkeleton />
      </PageContainer>
    );
  }

  const courseDenial = courseError ? JournalRouteErrors.denialOf(courseFailure) : null;
  if (courseDenial) {
    return (
      <PageContainer>
        {backLink}
        <JournalPanelMessage
          tone="empty"
          title={courseDenial === "forbidden" ? t("accessDenied") : t("notFound")}
          body={courseDenial === "forbidden" ? t("accessDeniedBody") : t("notFoundBody")}
        />
      </PageContainer>
    );
  }

  if (courseError || !course) {
    return (
      <PageContainer>
        {backLink}
        <JournalPanelMessage
          tone="error"
          title={t("loadFailedCourse")}
          retryLabel={t("common:retry")}
          onRetry={() => void refetchCourse()}
        />
      </PageContainer>
    );
  }

  const mentorProfile = mentorQuery.data;
  const metaItems: string[] = [
    ...(mentorProfile ? [`${mentorProfile.user.first_name} ${mentorProfile.user.last_name}`] : mentorQuery.isError ? [t("hub.mentorUnavailable")] : []),
    ...(rosterCount !== undefined ? [t("studentsCount", { count: rosterCount })] : []),
  ];

  const periodLabel: string = journal?.period_label ?? selectedPeriod?.period_label ?? "";
  const lessonSelection = route.lessonResolution;
  const courseHasNoStudents: boolean = journal !== undefined && !isSwitchingPeriod && journal.students.length === 0;
  const canManageRoster: boolean = role === "superadmin";

  const renderGradebookBody = () => {
    if (journalQuery.isLoading) return <JournalGridSkeleton />;
    if (journalQuery.isError && !journal) {
      return (
        <JournalPanelMessage
          tone="error"
          title={t("loadFailed")}
          body={queueStatus.hasPending ? t("workspace.draftsKept") : undefined}
          retryLabel={t("common:retry")}
          onRetry={() => void journalQuery.refetch()}
        />
      );
    }
    if (!journal || journalId === undefined) return null;
    const refreshFailedNotice = journalQuery.isError ? (
      <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void journalQuery.refetch() }}>
        {t("grid.refreshFailed")}
      </JournalNotice>
    ) : null;

    let body: React.ReactNode;
    if (isFiltering && matchedCount === 0) {
      body = (
        <JournalPanelMessage
          tone="empty"
          title={t("search.noMatchTitle")}
          body={t("search.noMatchBody", { query: searchQuery.trim() })}
          retryLabel={t("search.clear")}
          onRetry={() => setSearchQuery("")}
        />
      );
    } else if (journal.lesson_dates.length === 0) {
      body = <JournalPanelMessage tone="empty" title={t("grid.noLessonsTitle")} body={t("grid.noLessonsBody")} />;
    } else {
      body = (
        <JournalGrid
          key={journal.journal_id}
          journalId={journal.journal_id}
          periodLabel={periodLabel}
          students={orderedStudents}
          visibleStudentIds={visibleStudentIds}
          lessonDates={JournalWorkspaceSelection.orderLessonDates(journal.lesson_dates)}
          selectedLesson={lessonSelection.lesson}
          cellStatus={autosave.cellStatus}
          summaryStatus={autosave.summaryStatus}
          editing={editing}
          examMaximum={journal.exam_max_score}
          bonusMaximum={journal.bonus_max_score}
          onSelectLesson={route.selectLesson}
        />
      );
    }
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {refreshFailedNotice}
        {body}
      </div>
    );
  };

  return (
    <PageContainer>
      <JournalDrainDialog guard={navigationGuard} onReview={() => setReviewOpen(true)} />
      <JournalConflictReview
        open={reviewOpen}
        conflicts={queueStatus.conflicts}
        refetching={queueStatus.refetching}
        onClose={() => setReviewOpen(false)}
        onResolve={(conflictJournalId, conflict, choice) =>
          registry.ownerFor(conflictJournalId).resolveConflict(conflict, choice)
        }
        onRefetch={(conflictJournalId) => void registry.ownerFor(conflictJournalId).retryManual()}
      />

      <div className="flex flex-col gap-1">
        <PageHeader backTo="/journals" backLabel={t("backToJournals")} title={course.title} />
        {metaItems.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {metaItems.map((item: string, index: number) => (
              <span key={`${index}-${item}`} className="flex items-center gap-2 tabular-nums">
                {index > 0 && <span aria-hidden="true">·</span>}
                <span>{item}</span>
              </span>
            ))}
          </p>
        )}
      </div>

      {periodsLoading ? (
        <JournalPeriodBarSkeleton />
      ) : periodsError ? (
        <JournalPanelMessage
          tone="error"
          title={t("workspace.periodsLoadFailed")}
          retryLabel={t("common:retry")}
          onRetry={() => void refetchPeriods()}
        />
      ) : !periods || periods.length === 0 || !selectedPeriod ? (
        <JournalPanelMessage tone="empty" title={t("workspace.noPeriodsTitle")} body={t("workspace.noPeriodsBody")} />
      ) : (
        <>
          {route.notices.includes("period") && (
            <JournalNotice
              tone="info"
              testId="journal-route-notice-period"
              action={{ label: t("workspace.notice.dismiss"), onClick: route.dismissNotices }}
            >
              {t("workspace.notice.period", { period: periodName(periodLabel) })}
            </JournalNotice>
          )}
          {route.notices.includes("lesson") && lessonSelection.lesson && (
            <JournalNotice
              tone="info"
              testId="journal-route-notice-lesson"
              action={{ label: t("workspace.notice.dismiss"), onClick: route.dismissNotices }}
            >
              {t("workspace.notice.lesson", { date: formatSchoolLessonDate(lessonSelection.lesson) })}
            </JournalNotice>
          )}
          {isArchivedForMentor && (
            <JournalNotice tone="info" testId="journal-archived-notice">
              {t("workspace.readOnlyArchived")}
            </JournalNotice>
          )}
          {queueStatus.forbidden && (
            <JournalNotice tone="warning" testId="journal-forbidden-notice">
              {t("workspace.forbidden")}
            </JournalNotice>
          )}

          {courseHasNoStudents ? (
            <JournalPanelMessage
              tone="empty"
              title={t("table.noStudentsInCourse")}
              body={canManageRoster ? t("table.noStudentsAdminBody") : t("table.noStudentsBody")}
            >
              {canManageRoster && (
                <Link
                  to={`/courses/${course.id}`}
                  className="inline-flex min-h-11 items-center rounded-[10px] bg-maroon px-4 text-sm font-semibold text-on-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                >
                  {t("table.addStudents")}
                </Link>
              )}
            </JournalPanelMessage>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="journal-toolbar">
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <JournalPeriodSelect
                    periods={periods}
                    selectedPeriodId={selectedPeriod.id}
                    today={today}
                    onSelect={route.selectPeriod}
                    disabled={queueStatus.draining}
                  />
                  {editorsMounted && journal && <JournalPeriodMenu onOpenSettings={() => setSettingsJournalId(journalId ?? null)} />}
                </div>
                {rosterSearchVisible && (
                  <JournalRosterSearch
                    query={searchQuery}
                    onChange={setSearchQuery}
                    matched={matchedCount}
                    total={orderedStudents.length}
                    filtering={isFiltering}
                  />
                )}
                <div className="ml-auto flex items-center gap-2">
                  <JournalSaveStatus
                    status={queueStatus}
                    retryable={!queueStatus.forbidden}
                    onRetry={() => void registry.retryAll()}
                    onReview={() => setReviewOpen(true)}
                  />
                  {editing && journal && journal.lesson_dates.length > 0 && <JournalKeyboardHelp />}
                </div>
              </div>

              <JournalProgressView courseId={courseId} />

              <section className="flex min-w-0 flex-col gap-3" aria-label={t("workspace.tabs.gradebook")}>
                <JournalPeriodTransition
                  displayedJournalId={journal?.journal_id}
                  displayedPeriodStart={journal?.period_start}
                  switching={isSwitchingPeriod}
                >
                  {renderGradebookBody()}
                </JournalPeriodTransition>
              </section>
            </>
          )}
        </>
      )}

      {editorsMounted && journal && (
        <JournalPeriodSettingsDialog
          open={settingsOpen}
          suspended={reviewOpen}
          courseTitle={course.title}
          periodLabel={journal.period_label}
          periodStart={journal.period_start}
          periodEnd={journal.period_end}
          currentMaximum={journal.exam_max_score}
          currentBonusMaximum={journal.bonus_max_score ?? JournalScoringRules.DEFAULT_BONUS_MAXIMUM}
          highestExamScore={JournalPeriodSettingsRules.highestExamScore(journal.students)}
          highestBonusScore={JournalPeriodSettingsRules.highestBonusScore(journal.students)}
          drain={() => registry.drainAll()}
          submit={async (examMaximum: number, bonusMaximum: number) => {
            const payload: JournalExamMaxScoreUpdate = {};
            if (examMaximum !== journal.exam_max_score) payload.exam_max_score = examMaximum;
            if (bonusMaximum !== (journal.bonus_max_score ?? JournalScoringRules.DEFAULT_BONUS_MAXIMUM)) {
              payload.bonus_max_score = bonusMaximum;
            }
            await updateExamMaxScore.mutateAsync(payload);
          }}
          onBusyChange={setSettingsBusy}
          onReview={() => setReviewOpen(true)}
          onClose={() => setSettingsJournalId(null)}
          returnFocusSelector="[data-period-menu] button"
        />
      )}
    </PageContainer>
  );
}
