import { useTranslation } from "react-i18next";
import { useMyStudentProfile } from "../../lib/users/hooks";
import type { StudentCourseProfile } from "../../lib/users/types";
import { StudentCourseListRow } from "../../components/student/StudentCourseListRow";
import { StaleNotice } from "../../components/pane/PaneStates";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";
import { Tabs, tabPanelElementId, useTabParam, type TabDefinition } from "../../components/ui/Tabs";

type CourseBucket = "active" | "archive";

const BUCKET_IDS: readonly CourseBucket[] = ["active", "archive"];
const SKELETON_ROW_COUNT: number = 3;
const PANEL_ID_PREFIX: string = "my-courses";

function CourseRowsSkeleton() {
  const { t } = useTranslation("student");
  return (
    <div role="status" aria-busy="true" data-testid="courses-skeleton" className="flex flex-col">
      <span className="sr-only">{t("loadingCourses")}</span>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index: number) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 motion-safe:animate-pulse">
          <div className="size-10 rounded-[10px] bg-strip" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-48 rounded bg-strip" />
            <div className="h-3 w-32 rounded bg-strip" />
          </div>
          <div className="h-4 w-16 rounded bg-strip" />
        </div>
      ))}
    </div>
  );
}

export function MyCourses() {
  const { t } = useTranslation(["student", "common"]);
  const [bucket, selectBucket] = useTabParam(BUCKET_IDS, "active");
  const { data: profile, isLoading, isError, refetch } = useMyStudentProfile();

  const activeCourses: StudentCourseProfile[] = profile ? profile.courses.filter((entry: StudentCourseProfile) => entry.bucket === "active") : [];
  const archiveCourses: StudentCourseProfile[] = profile ? profile.courses.filter((entry: StudentCourseProfile) => entry.bucket === "archive") : [];
  const visibleCourses: StudentCourseProfile[] = bucket === "archive" ? archiveCourses : activeCourses;

  const tabs: TabDefinition[] = [
    { id: "active", label: t("student:activeSegment"), count: profile ? activeCourses.length : undefined },
    { id: "archive", label: t("student:archiveSegment"), count: profile ? archiveCourses.length : undefined },
  ];

  const renderBody = () => {
    if (isLoading) return <CourseRowsSkeleton />;
    if (isError && !profile) return <ErrorState title={t("student:coursesRefreshError")} onRetry={() => void refetch()} />;
    if (visibleCourses.length === 0) {
      return bucket === "archive" ? (
        <EmptyState
          title={t("student:noArchivedTitle")}
          description={t("student:noArchivedBody")}
          action={<Button type="button" variant="secondary" onClick={() => selectBucket("active")}>{t("student:returnToActive")}</Button>}
        />
      ) : (
        <EmptyState title={t("student:noCoursesTitle")} description={t("student:noCoursesBody")} />
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {isError && <StaleNotice message={t("student:coursesRefreshError")} onRetry={() => void refetch()} />}
        <ul className="flex flex-col" aria-label={bucket === "archive" ? t("student:archiveSegment") : t("student:activeSegment")}>
          {visibleCourses.map((entry: StudentCourseProfile) => (
            <li key={entry.course.id}>
              <StudentCourseListRow entry={entry} />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <PageContainer>
      <PageHeader title={t("student:myCoursesTitle")} />
      <Tabs tabs={tabs} value={bucket} onChange={selectBucket} ariaLabel={t("student:bucketTabsLabel")} idPrefix={PANEL_ID_PREFIX} />
      <div role="tabpanel" id={tabPanelElementId(PANEL_ID_PREFIX, bucket)} aria-labelledby={`${PANEL_ID_PREFIX}-tab-${bucket}`}>
        <div className="rounded-2xl border border-border bg-card p-2">{renderBody()}</div>
      </div>
    </PageContainer>
  );
}
