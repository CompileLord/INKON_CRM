import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourse } from "../../lib/courses/hooks";
import { useMentorProfile, useMyStudentProfile } from "../../lib/users/hooks";
import { useAuthStore } from "../../store/authStore";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { useCourseScheduleSummary } from "../../lib/students/useCourseScheduleSummary";
import type { StudentCourseProfile } from "../../lib/users/types";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { JournalProgressView } from "../../components/journals/JournalProgressView";
import { CourseDescription } from "../../components/student/CourseDescription";
import { CourseDetailStats } from "../../components/student/CourseDetailStats";
import { StudentCourseJournal } from "../../components/student/StudentCourseJournal";
import { CourseThumb } from "../../components/student/CourseThumb";
import { PanelSkeleton } from "../../components/pane/PaneStates";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";

function parseCourseId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

interface CourseNoticePageProps {
  backLabel: string;
  children: ReactNode;
}

function CourseNoticePage({ backLabel, children }: CourseNoticePageProps) {
  const { t } = useTranslation("student");
  return (
    <PageContainer>
      <PageHeader title={t("myCoursesTitle")} backTo="/my/courses" backLabel={backLabel} />
      {children}
    </PageContainer>
  );
}

export function MyCourseDetail() {
  const { courseId: rawCourseId } = useParams<{ courseId: string }>();
  const courseId: number | undefined = parseCourseId(rawCourseId);
  const { t } = useTranslation(["student", "common"]);
  const userId: number | null = useAuthStore((state) => state.userId);

  const courseQuery = useCourse(courseId);
  const profileQuery = useMyStudentProfile();
  const course = courseQuery.data;
  const mentorQuery = useMentorProfile(course?.mentor_id);
  const scheduleSummary = useCourseScheduleSummary(course);

  const entry: StudentCourseProfile | undefined = profileQuery.data?.courses.find((candidate: StudentCourseProfile) => candidate.course.id === courseId);
  const listHref: string = entry?.bucket === "archive" ? "/my/courses?tab=archive" : "/my/courses";

  if (courseId === undefined) {
    return (
      <CourseNoticePage backLabel={t("backToCourses")}>
        <EmptyState title={t("courseNotFoundTitle")} description={t("courseNotFoundBody")} />
      </CourseNoticePage>
    );
  }
  if (courseQuery.isLoading) {
    return (
      <CourseNoticePage backLabel={t("backToCourses")}>
        <div data-testid="course-detail-skeleton"><PanelSkeleton label={t("loadingCourse")} /></div>
      </CourseNoticePage>
    );
  }
  const denial = courseQuery.isError ? JournalRouteErrors.denialOf(courseQuery.error) : null;
  if (denial) {
    return (
      <CourseNoticePage backLabel={t("backToCourses")}>
        <EmptyState
          title={denial === "forbidden" ? t("courseForbiddenTitle") : t("courseNotFoundTitle")}
          description={denial === "forbidden" ? t("courseForbiddenBody") : t("courseNotFoundBody")}
        />
      </CourseNoticePage>
    );
  }
  if (courseQuery.isError || !course) {
    return (
      <CourseNoticePage backLabel={t("backToCourses")}>
        <ErrorState title={t("courseLoadFailed")} onRetry={() => void courseQuery.refetch()} />
      </CourseNoticePage>
    );
  }

  const mentorUser = mentorQuery.data?.user;
  const metaItems: string[] = [
    `${formatSchoolLessonDate(course.start_date)} – ${formatSchoolLessonDate(course.end_date)}`,
    ...(scheduleSummary.scheduleLine !== "" ? [scheduleSummary.scheduleLine] : []),
    ...(mentorUser !== undefined ? [`${mentorUser.first_name} ${mentorUser.last_name}`] : []),
    ...(scheduleSummary.nextLessonLabel !== null ? [t("nextLessonChip", { when: scheduleSummary.nextLessonLabel })] : []),
  ];

  return (
    <PageContainer>
      <PageHeader backTo={listHref} backLabel={t("myCoursesTitle")} title={course.title} />
      <div className="flex min-w-0 items-center gap-3">
        <CourseThumb title={course.title} photoPath={course.photo_path} size="lg" />
        <p data-testid="course-meta" className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {metaItems.map((item: string, index: number) => (
            <span key={`${index}-${item}`} className="flex items-center gap-2 tabular-nums">
              {index > 0 && <span aria-hidden="true">·</span>}
              <span>{item}</span>
            </span>
          ))}
        </p>
      </div>

      {profileQuery.isError && !entry ? (
        <ErrorState title={t("profileRefreshError")} message={t("profileUnavailableBody")} onRetry={() => void profileQuery.refetch()} />
      ) : profileQuery.isLoading ? (
        <div data-testid="stats-skeleton"><PanelSkeleton label={t("common:loading")} rows={1} /></div>
      ) : (
        <CourseDetailStats entry={entry} />
      )}

      {userId !== null && <StudentCourseJournal courseId={courseId} selfStudentId={userId} />}

      <JournalProgressView courseId={courseId} readOnlySelfStudentId={userId ?? undefined} collapsedByDefault />

      {course.description.trim() !== "" && <CourseDescription description={course.description} />}
    </PageContainer>
  );
}
