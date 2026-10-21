import { useTranslation } from "react-i18next";
import { useMyStudentProfile } from "../../lib/users/hooks";
import type { StudentCourseProfile } from "../../lib/users/types";
import { StudentDashboardCourses } from "../student/StudentDashboardCourses";
import { ErrorState } from "../ui/ErrorState";
import { PageContainer } from "../ui/PageContainer";
import { PageHeader } from "../ui/PageHeader";
import { StaleNotice } from "../pane/PaneStates";

export function StudentDashboard() {
  const { t } = useTranslation(["student", "common"]);
  const profileQuery = useMyStudentProfile();
  const profile = profileQuery.data;
  const user = profile?.user;
  const activeCourses: StudentCourseProfile[] = (profile?.courses ?? []).filter((entry: StudentCourseProfile) => entry.bucket === "active");
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
          <StudentDashboardCourses activeCourses={activeCourses} isLoading={profileLoading} />
        </>
      )}
    </PageContainer>
  );
}
