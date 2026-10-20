import { useTranslation } from "react-i18next";
import { useMyStudentProfile, useMyStudentJournals } from "../../lib/users/hooks";
import { getSchoolCalendarDate } from "../../i18n/formatters";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";
import { StudentDashboardCourses } from "../student/StudentDashboardCourses";
import { StudentDashboardStats } from "../student/StudentDashboardStats";
import { StudentLatestResult } from "../student/StudentLatestResult";
import { StudentNextLesson } from "../student/StudentNextLesson";
import { ErrorState } from "../ui/ErrorState";
import { PageContainer } from "../ui/PageContainer";
import { PageHeader } from "../ui/PageHeader";
import { StaleNotice } from "../pane/PaneStates";

export function StudentDashboard() {
  const { t } = useTranslation(["student", "common"]);
  const profileQuery = useMyStudentProfile();
  const journalsQuery = useMyStudentJournals();

  const profile = profileQuery.data;
  const user = profile?.user;
  const courses: StudentCourseProfile[] = profile?.courses ?? [];
  const activeCourses: StudentCourseProfile[] = courses.filter((entry: StudentCourseProfile) => entry.bucket === "active");
  const soonestLessonCourse: StudentCourseProfile | undefined = activeCourses
    .filter((entry: StudentCourseProfile) => entry.next_lesson_at !== null)
    .sort((first: StudentCourseProfile, second: StudentCourseProfile) => new Date(first.next_lesson_at!).getTime() - new Date(second.next_lesson_at!).getTime())[0];

  const schoolToday: string = getSchoolCalendarDate();
  const journals: StudentJournalPeriod[] | undefined = journalsQuery.data;
  const availablePeriods: StudentJournalPeriod[] = (journals ?? []).filter((period: StudentJournalPeriod) => period.period_start <= schoolToday);
  const profileFailed: boolean = profile === undefined && profileQuery.isError;
  const profileLoading: boolean = profile === undefined && profileQuery.isLoading;

  return (
    <PageContainer>
      <PageHeader title={user ? `${user.first_name} ${user.last_name}` : t("student:studentDashboard")} />
      {profileFailed ? (
        <ErrorState title={t("student:profileRefreshError")} message={t("student:profileUnavailableBody")} onRetry={() => void profileQuery.refetch()} />
      ) : (
        <>
          {profileQuery.isError && profile !== undefined && <StaleNotice message={t("student:profileRefreshError")} onRetry={() => void profileQuery.refetch()} />}
          <StudentDashboardStats totals={profile?.totals} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-6">
              {profileLoading ? (
                <div role="status" aria-busy="true" className="h-32 rounded-2xl border border-border bg-card motion-safe:animate-pulse">
                  <span className="sr-only">{t("common:loading")}</span>
                </div>
              ) : (
                <>
                  <StudentNextLesson course={soonestLessonCourse?.course} nextLessonAt={soonestLessonCourse?.next_lesson_at} />
                  <StudentDashboardCourses activeCourses={activeCourses} />
                </>
              )}
            </div>
            <StudentLatestResult
              journal={availablePeriods[0]}
              hasLoadedData={journals !== undefined}
              hasUpcomingPeriods={(journals?.length ?? 0) > 0 && availablePeriods.length === 0}
              isLoading={journalsQuery.isLoading}
              isError={journalsQuery.isError}
              onRetry={() => void journalsQuery.refetch()}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
