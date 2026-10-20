import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourse, useCourseSchedule } from "../../lib/courses/hooks";
import { useMentorProfile, useMyStudentJournals, useMyStudentProfile } from "../../lib/users/hooks";
import { useAuthStore } from "../../store/authStore";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { NextLessonCalculator, type ScheduleGroup, type UpcomingLesson } from "../../lib/students/NextLessonCalculator";
import { CourseResultSummaries, type CourseResultSummary } from "../../lib/students/CourseResultSummary";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";
import { formatSchoolLessonDate, formatTime } from "../../i18n/formatters";
import { JournalProgressView } from "../../components/journals/JournalProgressView";
import { CourseDescription } from "../../components/student/CourseDescription";
import { CourseDetailStats } from "../../components/student/CourseDetailStats";
import { CoursePeriodList } from "../../components/student/CoursePeriodList";
import { CourseThumb } from "../../components/student/CourseThumb";
import { PanelSkeleton, StaleNotice } from "../../components/pane/PaneStates";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { PageContainer } from "../../components/ui/PageContainer";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionCard } from "../../components/ui/SectionCard";

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
  const scheduleQuery = useCourseSchedule(courseId);
  const profileQuery = useMyStudentProfile();
  const periodsQuery = useMyStudentJournals(courseId);
  const course = courseQuery.data;
  const mentorQuery = useMentorProfile(course?.mentor_id);

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

  const scheduleGroups: ScheduleGroup[] = scheduleQuery.data ? NextLessonCalculator.groupByTime(scheduleQuery.data) : [];
  const nextLesson: UpcomingLesson | null =
    scheduleQuery.data && course.status === "active" ? NextLessonCalculator.next(scheduleQuery.data, course.end_date, new Date()) : null;
  const weekdayName = (index: number): string => t(`weekdays.${index}`);
  const scheduleLine: string = scheduleGroups
    .map((group: ScheduleGroup) => `${group.weekdayIndexes.map(weekdayName).join(" · ")} ${formatTime(group.timeStart)}–${formatTime(group.timeEnd)}`)
    .join("; ");
  const periods: StudentJournalPeriod[] = periodsQuery.data ?? [];
  const results: CourseResultSummary | null = periodsQuery.data ? CourseResultSummaries.summarize(periodsQuery.data) : null;
  const mentorUser = mentorQuery.data?.user;
  const metaItems: string[] = [
    `${formatSchoolLessonDate(course.start_date)} – ${formatSchoolLessonDate(course.end_date)}`,
    ...(scheduleLine !== "" ? [scheduleLine] : []),
    ...(mentorUser !== undefined ? [`${mentorUser.first_name} ${mentorUser.last_name}`] : []),
    ...(nextLesson !== null ? [t("nextLessonChip", { when: `${weekdayName(nextLesson.weekdayIndex)} ${formatTime(nextLesson.timeStart)}` })] : []),
  ];

  const renderPeriods = () => {
    if (periodsQuery.isLoading) return <PanelSkeleton label={t("loadingPeriods")} rows={3} />;
    if (periodsQuery.isError && !periodsQuery.data) return <ErrorState title={t("periodsLoadFailed")} onRetry={() => void periodsQuery.refetch()} />;
    if (periods.length === 0) return <EmptyState title={t("noPeriods")} description={t("noPeriodsBody")} />;
    return (
      <div className="flex flex-col gap-2">
        {periodsQuery.isError && <StaleNotice message={t("journalsRefreshError")} onRetry={() => void periodsQuery.refetch()} />}
        <CoursePeriodList periods={periods} />
      </div>
    );
  };

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

      {profileQuery.isError && !entry && !results ? (
        <ErrorState title={t("profileRefreshError")} message={t("profileUnavailableBody")} onRetry={() => void profileQuery.refetch()} />
      ) : profileQuery.isLoading ? (
        <div data-testid="stats-skeleton"><PanelSkeleton label={t("common:loading")} rows={1} /></div>
      ) : (
        <CourseDetailStats entry={entry} results={results} />
      )}

      <SectionCard title={t("periodsTitle")}>{renderPeriods()}</SectionCard>

      <JournalProgressView courseId={courseId} readOnlySelfStudentId={userId ?? undefined} />

      {course.description.trim() !== "" && <CourseDescription description={course.description} />}
    </PageContainer>
  );
}
