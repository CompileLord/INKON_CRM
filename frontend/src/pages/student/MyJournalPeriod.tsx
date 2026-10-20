import { useCallback, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourse, useCourseJournals } from "../../lib/courses/hooks";
import { useScopedJournal } from "../../lib/journals/hooks";
import { useJournalWorkspaceRoute } from "../../lib/journals/useJournalWorkspaceRoute";
import { JournalWorkspaceSelection } from "../../lib/journals/JournalWorkspaceSelection";
import { useAuthStore } from "../../store/authStore";
import { formatSchoolLessonDate, getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { JournalPeriodSelect } from "../../components/journals/JournalPeriodSelect";
import { PanelSkeleton, StaleNotice } from "../../components/pane/PaneStates";
import { OwnLessonNotes } from "../../components/student/OwnLessonNotes";
import { PeriodScoreSummary } from "../../components/student/PeriodScoreSummary";
import { StudentLessonRecords } from "../../components/student/StudentLessonRecords";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";
import { usePeriodName } from "../../components/ui/periodName";
import type { JournalStudentResponse } from "../../lib/journals/types";

function parseJournalId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

interface PeriodNoticePageProps {
  backHref: string;
  backLabel: string;
  children: ReactNode;
}

function PeriodNoticePage({ backHref, backLabel, children }: PeriodNoticePageProps) {
  const { t } = useTranslation("student");
  return (
    <PageContainer>
      <PageHeader title={t("myCoursesTitle")} backTo={backHref} backLabel={backLabel} />
      {children}
    </PageContainer>
  );
}

export function MyJournalPeriod() {
  const { journalId: rawJournalId } = useParams<{ journalId: string }>();
  const journalId: number | undefined = parseJournalId(rawJournalId);
  const { t } = useTranslation(["student", "journals", "common"]);
  const periodName: (label: string) => string = usePeriodName();
  const navigate = useNavigate();
  const userId: number | null = useAuthStore((state) => state.userId);
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

  const backHref: string = courseId !== undefined ? `/my/courses/${courseId}` : "/my/courses";
  const backLabel: string = course ? course.title : t("backToCourses");

  if (journalId === undefined) {
    return (
      <PeriodNoticePage backHref={backHref} backLabel={backLabel}>
        <EmptyState title={t("journalNotFoundTitle")} description={t("journalNotFoundBody")} />
      </PeriodNoticePage>
    );
  }
  if (initialQuery.isLoading) {
    return (
      <PeriodNoticePage backHref={backHref} backLabel={backLabel}>
        <PanelSkeleton label={t("common:loading")} rows={3} />
      </PeriodNoticePage>
    );
  }
  const denial = initialQuery.isError && !journal ? JournalRouteErrors.denialOf(initialQuery.error) : null;
  if (denial) {
    return (
      <PeriodNoticePage backHref={backHref} backLabel={backLabel}>
        <EmptyState
          title={denial === "forbidden" ? t("courseForbiddenTitle") : t("journalNotFoundTitle")}
          description={denial === "forbidden" ? t("courseForbiddenBody") : t("journalNotFoundBody")}
        />
      </PeriodNoticePage>
    );
  }
  if (initialQuery.isError && !journal) {
    return (
      <PeriodNoticePage backHref={backHref} backLabel={backLabel}>
        <ErrorState title={t("journalLoadFailed")} onRetry={() => void initialQuery.refetch()} />
      </PeriodNoticePage>
    );
  }
  if (!journal || userId === null) return null;

  const periods = periodsQuery.data;
  const lessonDates: string[] = JournalWorkspaceSelection.orderLessonDates(journal.lesson_dates);
  const switching: boolean = route.journalQuery.isPlaceholderData;

  return (
    <PageContainer>
      <PageHeader
        backTo={backHref}
        backLabel={backLabel}
        title={periodName(journal.period_label)}
        count={`${formatSchoolLessonDate(journal.period_start)} – ${formatSchoolLessonDate(journal.period_end)}`}
      />

      {periodsQuery.isLoading ? (
        <PanelSkeleton label={t("common:loading")} rows={1} />
      ) : periodsQuery.isError && !periods ? (
        <ErrorState title={t("journals:workspace.periodsLoadFailed")} onRetry={() => void periodsQuery.refetch()} />
      ) : periods && periods.length > 0 ? (
        <JournalPeriodSelect periods={periods} selectedPeriodId={journalId} today={today} onSelect={route.selectPeriod} />
      ) : null}

      {route.journalQuery.isError && <StaleNotice message={t("journals:grid.refreshFailed")} onRetry={() => void route.journalQuery.refetch()} />}

      {switching ? (
        <PanelSkeleton label={t("common:loading")} rows={4} />
      ) : (
        <>
          <PeriodScoreSummary summary={selfRecord?.summary ?? null} />
          <StudentLessonRecords lessonDates={lessonDates} entries={selfRecord?.entries ?? []} />
          {selfRecord && <OwnLessonNotes entries={selfRecord.entries} />}
        </>
      )}
    </PageContainer>
  );
}
