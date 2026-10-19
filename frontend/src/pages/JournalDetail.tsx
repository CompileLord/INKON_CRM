import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { useCourse, useCourseJournals } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { useCourseEnrollmentsCount } from "../lib/enrollments/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { useAuthStore } from "../store/authStore";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { JournalProgressView } from "../components/journals/JournalProgressView";
import { JournalGrid } from "../components/journals/JournalGrid";
import { JournalPeriodMenu } from "../components/journals/JournalPeriodMenu";
import { JournalPeriodPicker } from "../components/journals/JournalPeriodPicker";
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

  const backLink = <PageHeader backTo="/journals" backLabel={t("backToJournals")} />;

  if (courseId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage tone="empty" title={t("notFound")} />
      </div>
    );
  }

  if (courseLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalContextSkeleton />
      </div>
    );
  }

  const courseDenial = courseError ? JournalRouteErrors.denialOf(courseFailure) : null;
  if (courseDenial) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage
          tone="empty"
          title={courseDenial === "forbidden" ? t("accessDenied") : t("notFound")}
          body={courseDenial === "forbidden" ? t("accessDeniedBody") : t("notFoundBody")}
        />
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage
          tone="error"
          title={t("loadFailedCourse")}
          retryLabel={t("common:retry")}
          onRetry={() => void refetchCourse()}
        />
      </div>
    );
  }

  const mentorProfile = mentorQuery.data;
  const mentorLine = mentorProfile ? (
    <span className="flex items-center gap-2">
      <PersonAvatar
        firstName={mentorProfile.user.first_name}
        lastName={mentorProfile.user.last_name}
        photoUrl={resolveMediaUrl(mentorProfile.user.thumbnail_path ?? mentorProfile.user.photo_path) ?? undefined}
        size={24}
      />
      <span className="font-medium text-ink">
        {mentorProfile.user.first_name} {mentorProfile.user.last_name}
      </span>
    </span>
  ) : mentorQuery.isError ? (
    <span>{t("hub.mentorUnavailable")}</span>
  ) : null;

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
    <div className="flex flex-col gap-3 lg:gap-4">
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

      <PageHeader backTo="/journals" backLabel={t("backToJournals")} title={course.title}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {mentorLine}
          {rosterCount !== undefined && (
            <span className="flex items-center gap-1 tabular-nums">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("studentsCount", { count: rosterCount })}
            </span>
          )}
        </div>
      </PageHeader>

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
              {t("workspace.notice.period", { period: periodLabel })}
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
              <div className="flex flex-wrap items-center gap-2" data-testid="journal-toolbar">
                <JournalPeriodPicker
                  periods={periods}
                  selectedPeriodId={selectedPeriod.id}
                  today={today}
                  onSelect={route.selectPeriod}
                  disabled={queueStatus.draining}
                />
                {editorsMounted && journal && <JournalPeriodMenu onOpenSettings={() => setSettingsJournalId(journalId ?? null)} />}
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

              <JournalProgressView courseId={courseId} chartOnly />

              <section className="flex min-w-0 flex-col gap-2 lg:gap-4" aria-label={t("workspace.tabs.gradebook")}>
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
          highestExamScore={JournalPeriodSettingsRules.highestExamScore(journal.students)}
          drain={() => registry.drainAll()}
          submit={async (examMaximum: number) => {
            await updateExamMaxScore.mutateAsync({ exam_max_score: examMaximum });
          }}
          onBusyChange={setSettingsBusy}
          onReview={() => setReviewOpen(true)}
          onClose={() => setSettingsJournalId(null)}
          returnFocusSelector="[data-period-menu]"
        />
      )}
    </div>
  );
}
