import { useId, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Settings, Users } from "lucide-react";
import { useCourse, useCourseJournals, useCourseProgressChart } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { useCourseEnrollmentsCount } from "../lib/enrollments/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { useAuthStore } from "../store/authStore";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { Button } from "../components/ui/Button";
import { JournalScoreChart } from "../components/journals/JournalScoreChart";
import { JournalGrid } from "../components/journals/JournalGrid";
import { JournalSummaryList } from "../components/journals/JournalSummaryList";
import { JournalPeriodPicker } from "../components/journals/JournalPeriodPicker";
import { JournalWorkspaceTabs } from "../components/journals/JournalWorkspaceTabs";
import { JournalViewSwitch } from "../components/journals/JournalViewSwitch";
import { JournalLessonNavigator } from "../components/journals/JournalLessonNavigator";
import { JournalKeyboardHelp } from "../components/journals/JournalKeyboardHelp";
import { JournalSaveStatus } from "../components/journals/JournalSaveStatus";
import { JournalConflictReview } from "../components/journals/JournalConflictReview";
import { JournalDrainDialog } from "../components/journals/JournalDrainDialog";
import { ExamWeightModal } from "../components/journals/ExamWeightModal";
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
  const panelIdPrefix: string = useId();
  const [reviewOpen, setReviewOpen] = useState<boolean>(false);
  const [examModalOpen, setExamModalOpen] = useState<boolean>(false);

  if (reviewOpen && queueStatus.conflicts.length === 0) setReviewOpen(false);

  const { id: rawCourseId } = useParams<{ id: string }>();
  const courseId: number | undefined = JournalWorkspaceSelection.parseCourseId(rawCourseId);
  const today: string = getSchoolCalendarDate();

  const { data: course, isLoading: courseLoading, isError: courseError, refetch: refetchCourse } = useCourse(courseId);
  const mentorQuery = useMentorProfile(course?.mentor_id);
  const { data: rosterCount } = useCourseEnrollmentsCount(courseId);
  const {
    data: periods,
    isLoading: periodsLoading,
    isError: periodsError,
    refetch: refetchPeriods,
  } = useCourseJournals(courseId);
  const progressChartQuery = useCourseProgressChart(courseId);

  const route = useJournalWorkspaceRoute({ periods, today });
  const selectedPeriod = route.periodResolution.period;
  const journalId: number | undefined = selectedPeriod?.id;
  const { journalQuery } = route;
  const journal = journalQuery.data;

  const isArchivedForMentor: boolean = role === "mentor" && course?.status === "archived";
  const canEditByRole: boolean = role === "superadmin" || role === "mentor";
  const autosave = useJournalAutosave(canEditByRole && !isArchivedForMentor ? journalId : undefined, courseId);
  const updateExamMaxScore = useUpdateJournalExamMaxScore(journalId, courseId);

  const editorsMounted: boolean = canEditByRole && !isArchivedForMentor && !queueStatus.forbidden;
  const { applyEntryCommand, editSummaryField } = autosave;
  const editing: JournalRowEditing | null = useMemo(
    () => (editorsMounted ? { onEntryCommand: applyEntryCommand, onSummaryField: editSummaryField } : null),
    [editorsMounted, applyEntryCommand, editSummaryField],
  );

  const backLink = (
    <Link
      to="/journals"
      className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[10px] text-sm font-semibold text-maroon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft size={16} aria-hidden="true" /> {t("backToJournals")}
    </Link>
  );

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

  const periodLabel: string = selectedPeriod?.period_label ?? "";
  const lessonSelection = route.lessonResolution;
  const gradebookStatusVisible: boolean = route.tab === "gradebook" || queueStatus.phase !== "idle";

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
    if (journal.students.length === 0) {
      body = (
        <JournalPanelMessage
          tone="empty"
          title={t("table.noStudentsInCourse")}
          body={t("table.noStudentsBody")}
        />
      );
    } else if (route.view === "summary") {
      body = <JournalSummaryList students={journal.students} periodLabel={periodLabel} />;
    } else if (journal.lesson_dates.length === 0) {
      body = <JournalPanelMessage tone="empty" title={t("grid.noLessonsTitle")} body={t("grid.noLessonsBody")} />;
    } else {
      body = (
        <JournalGrid
          key={journalId}
          journalId={journalId}
          periodLabel={periodLabel}
          students={journal.students}
          lessonDates={JournalWorkspaceSelection.orderLessonDates(journal.lesson_dates)}
          selectedLesson={lessonSelection.lesson}
          examMaxScore={journal.exam_max_score}
          cellStatus={autosave.cellStatus}
          summaryStatus={autosave.summaryStatus}
          editing={editing}
          onSelectLesson={route.selectLesson}
        />
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {refreshFailedNotice}
        {body}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
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

      <header className="flex flex-col gap-2">
        {backLink}
        <h1 className="break-words text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">
          {course.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {mentorLine}
          {rosterCount !== undefined && (
            <span className="flex items-center gap-1 tabular-nums">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("studentsCount", { count: rosterCount })}
            </span>
          )}
        </div>
      </header>

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
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start">
            <JournalPeriodPicker
              periods={periods}
              selectedPeriodId={selectedPeriod.id}
              today={today}
              onSelect={route.selectPeriod}
              disabled={queueStatus.draining}
            />
            {editing && journal && (
              <Button type="button" variant="secondary" onClick={() => setExamModalOpen(true)} className="w-full lg:w-auto">
                <Settings className="h-4 w-4" aria-hidden="true" />
                {t("workspace.periodSettings")}
              </Button>
            )}
          </div>

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

          <JournalWorkspaceTabs selected={route.tab} onSelect={route.selectTab} idPrefix={panelIdPrefix} />

          {route.tab === "gradebook" ? (
            <section
              role="tabpanel"
              id={`${panelIdPrefix}-panel-gradebook`}
              aria-labelledby={`${panelIdPrefix}-tab-gradebook`}
              className="flex min-w-0 flex-col gap-4"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <JournalViewSwitch selected={route.view} onSelect={route.selectView} />
                {route.view === "grid" && journal && (
                  <JournalLessonNavigator
                    lessonDates={journal.lesson_dates}
                    selectedLesson={lessonSelection.lesson}
                    today={today}
                    onSelect={route.selectLesson}
                  />
                )}
                <div data-testid="journal-search-slot" className="hidden min-h-11 min-w-0 flex-1 basis-40 lg:block" />
                {editing && route.view === "grid" && journal && journal.lesson_dates.length > 0 && <JournalKeyboardHelp />}
                <div className="min-w-[14rem]">
                  <JournalSaveStatus
                    status={queueStatus}
                    retryable={!queueStatus.forbidden}
                    onRetry={() => void registry.retryAll()}
                    onReview={() => setReviewOpen(true)}
                  />
                </div>
              </div>
              {renderGradebookBody()}
            </section>
          ) : (
            <section
              role="tabpanel"
              id={`${panelIdPrefix}-panel-progress`}
              aria-labelledby={`${panelIdPrefix}-tab-progress`}
              className="flex min-w-0 flex-col gap-4"
            >
              {gradebookStatusVisible && queueStatus.phase !== "idle" && (
                <JournalSaveStatus
                  status={queueStatus}
                  retryable={!queueStatus.forbidden}
                  onRetry={() => void registry.retryAll()}
                  onReview={() => setReviewOpen(true)}
                />
              )}
              {progressChartQuery.isError ? (
                <JournalPanelMessage
                  tone="error"
                  title={t("workspace.progressLoadFailed")}
                  retryLabel={t("common:retry")}
                  onRetry={() => void progressChartQuery.refetch()}
                />
              ) : (
                <JournalScoreChart data={progressChartQuery.data} isLoading={progressChartQuery.isLoading} />
              )}
            </section>
          )}
        </>
      )}

      {examModalOpen && journal && (
        <ExamWeightModal
          isOpen={examModalOpen}
          currentWeight={journal.exam_max_score}
          onClose={() => setExamModalOpen(false)}
          onSave={async (newWeight: number) => {
            await updateExamMaxScore.mutateAsync({ exam_max_score: newWeight });
          }}
        />
      )}
    </div>
  );
}
