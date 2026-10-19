import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/PageHeader";
import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import { useMyStudentJournals, useMyStudentProfile } from "../../lib/users/hooks";
import { CourseResultSummaries } from "../../lib/students/CourseResultSummary";
import type { StudentCourseProfile } from "../../lib/users/types";
import { StudentCourseCard, type CourseResultState } from "../../components/student/StudentCourseCard";
import { StudentBucketTabs, type CourseBucket } from "../../components/student/StudentBucketTabs";
import { Button } from "../../components/ui/Button";
import { BrandActivityIndicator } from "../../components/ui/BrandActivityIndicator";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { JournalNotice, JournalPanelMessage } from "../../components/journals/JournalWorkspaceStates";

const CARD_GRID_CLASS: string = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
const SKELETON_CARD_COUNT: number = 3;

function CourseCardsSkeleton() {
  const { t } = useTranslation("student");
  return (
    <div role="status" aria-busy="true" data-testid="courses-skeleton" className={CARD_GRID_CLASS}>
      <span className="sr-only">{t("loadingCourses")}</span>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border-warm bg-card">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <BrandActivityIndicator size={22} aria-hidden="true" />
              <div className="h-5 w-3/4 rounded-md bg-beige-dark motion-safe:animate-pulse" />
            </div>
            <div className="h-4 w-1/2 rounded-md bg-beige-dark motion-safe:animate-pulse" />
            <div className="h-6 w-2/5 rounded-md bg-beige-dark motion-safe:animate-pulse" />
            <div className="h-8 w-full rounded-md bg-beige-dark motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MyCourses() {
  const { t } = useTranslation(["student", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const bucket: CourseBucket = searchParams.get("bucket") === "archive" ? "archive" : "active";
  const { data: profile, isLoading, isError, refetch } = useMyStudentProfile();
  const journalsQuery = useMyStudentJournals();
  const summaries = journalsQuery.data ? CourseResultSummaries.byCourse(journalsQuery.data) : null;
  const resultsOf = (courseId: number): CourseResultState =>
    summaries ? (summaries.get(courseId) ?? CourseResultSummaries.summarize([])) : journalsQuery.isError ? "unavailable" : "loading";

  const selectBucket = (next: CourseBucket): void => {
    setSearchParams(next === "archive" ? { bucket: "archive" } : {}, { replace: false });
  };

  const activeCourses: StudentCourseProfile[] = profile ? profile.courses.filter((entry) => entry.bucket === "active") : [];
  const archiveCourses: StudentCourseProfile[] = profile ? profile.courses.filter((entry) => entry.bucket === "archive") : [];
  const visibleCourses: StudentCourseProfile[] = bucket === "archive" ? archiveCourses : activeCourses;

  const renderBody = () => {
    if (isLoading) return <CourseCardsSkeleton />;
    if (isError && !profile) {
      return (
        <JournalPanelMessage
          tone="error"
          title={t("coursesRefreshError")}
          retryLabel={t("common:retry")}
          onRetry={() => void refetch()}
        />
      );
    }
    if (visibleCourses.length === 0) {
      return bucket === "archive" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card px-6 py-10 text-center">
          <h2 className="text-base font-semibold text-ink">{t("noArchivedTitle")}</h2>
          <p className="max-w-prose text-sm text-muted">{t("noArchivedBody")}</p>
          <Button type="button" variant="secondary" onClick={() => selectBucket("active")}>
            {t("returnToActive")}
          </Button>
        </div>
      ) : (
        <JournalPanelMessage tone="empty" title={t("noCoursesTitle")} body={t("noCoursesBody")} />
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {isError && (
          <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void refetch() }}>
            {t("coursesRefreshError")}
          </JournalNotice>
        )}
        <ul className={CARD_GRID_CLASS} aria-label={bucket === "archive" ? t("archiveSegment") : t("activeSegment")}>
          {visibleCourses.map((entry) => (
            <li key={entry.course.id} className="flex min-w-0 flex-col [&>a]:flex-1">
              <StudentCourseCard entry={entry} variant={bucket} results={resultsOf(entry.course.id)} />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titleIcon={<BookOpen className="h-6 w-6 text-maroon-text dark:text-accent" aria-hidden="true" />}
        title={t("myCoursesTitle")}
        info={<InfoTooltip label={t("coursesInfoLabel")}>{t("coursesInfo")}</InfoTooltip>}
      />
      <StudentBucketTabs
        selected={bucket}
        activeCount={profile ? activeCourses.length : null}
        archiveCount={profile ? archiveCourses.length : null}
        onSelect={selectBucket}
      />
      <div id="bucket-panel" role="tabpanel" aria-labelledby={`bucket-tab-${bucket}`}>
        {renderBody()}
      </div>
    </div>
  );
}
