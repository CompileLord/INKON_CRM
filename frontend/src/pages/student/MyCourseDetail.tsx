import { useId, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarDays, ChevronDown, Clock, Target, Trophy, UserX } from "lucide-react";
import { useCourse, useCourseSchedule } from "../../lib/courses/hooks";
import { useMyStudentJournals, useMyStudentProfile } from "../../lib/users/hooks";
import { useAuthStore } from "../../store/authStore";
import { JournalRouteErrors } from "../../components/journals/JournalRouteErrors";
import { NextLessonCalculator, type ScheduleGroup, type UpcomingLesson } from "../../lib/students/NextLessonCalculator";
import { ScoreBand } from "../../lib/students/ScoreBand";
import { CourseResultSummaries, type CourseResultSummary } from "../../lib/students/CourseResultSummary";
import { formatNumber, formatSchoolLessonDate, formatTime } from "../../i18n/formatters";
import { JournalProgressView } from "../../components/journals/JournalProgressView";
import { JournalNotice, JournalPanelMessage } from "../../components/journals/JournalWorkspaceStates";
import { InfoTooltip } from "../../components/ui/InfoTooltip";
import { BrandActivityIndicator } from "../../components/ui/BrandActivityIndicator";
import { CoursePeriodList } from "../../components/student/CoursePeriodList";
import { CourseStatTile } from "../../components/student/CourseStatTile";
import { TeacherLine } from "../../components/student/TeacherLine";

const DESCRIPTION_COLLAPSE_THRESHOLD: number = 140;

function parseCourseId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

function CourseDetailSkeleton() {
  const { t } = useTranslation("student");
  return (
    <div role="status" aria-busy="true" data-testid="course-detail-skeleton" className="flex flex-col gap-6">
      <span className="sr-only">{t("loadingCourse")}</span>
      <div className="h-4 w-48 rounded-md bg-beige-dark motion-safe:animate-pulse" />
      <div className="h-9 w-2/3 max-w-md rounded-md bg-beige-dark motion-safe:animate-pulse" />
      <div className="h-5 w-1/2 max-w-sm rounded-md bg-beige-dark motion-safe:animate-pulse" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex h-24 items-center justify-center rounded-2xl border border-border-warm bg-card">
            <BrandActivityIndicator size={22} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-border-warm bg-card" />
    </div>
  );
}

export function MyCourseDetail() {
  const { courseId: rawCourseId } = useParams<{ courseId: string }>();
  const courseId: number | undefined = parseCourseId(rawCourseId);
  const { t, i18n } = useTranslation(["student", "common"]);
  const userId: number | null = useAuthStore((state) => state.userId);
  const [descriptionOpen, setDescriptionOpen] = useState<boolean>(false);
  const descriptionId: string = useId();

  const courseQuery = useCourse(courseId);
  const scheduleQuery = useCourseSchedule(courseId);
  const profileQuery = useMyStudentProfile();
  const periodsQuery = useMyStudentJournals(courseId);

  const course = courseQuery.data;
  const entry = profileQuery.data?.courses.find((candidate) => candidate.course.id === courseId);
  const listHref: string = entry?.bucket === "archive" ? "/my/courses?bucket=archive" : "/my/courses";
  const backLink = <PageHeader backTo="/my/courses" backLabel={t("backToCourses")} />;

  if (courseId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage tone="empty" title={t("courseNotFoundTitle")} body={t("courseNotFoundBody")} />
      </div>
    );
  }
  if (courseQuery.isLoading) return <CourseDetailSkeleton />;

  const denial = courseQuery.isError ? JournalRouteErrors.denialOf(courseQuery.error) : null;
  if (denial) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage
          tone="empty"
          title={denial === "forbidden" ? t("courseForbiddenTitle") : t("courseNotFoundTitle")}
          body={denial === "forbidden" ? t("courseForbiddenBody") : t("courseNotFoundBody")}
        />
      </div>
    );
  }
  if (courseQuery.isError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <JournalPanelMessage tone="error" title={t("courseLoadFailed")} retryLabel={t("common:retry")} onRetry={() => void courseQuery.refetch()} />
      </div>
    );
  }

  const scheduleGroups: ScheduleGroup[] = scheduleQuery.data ? NextLessonCalculator.groupByTime(scheduleQuery.data) : [];
  const nextLesson: UpcomingLesson | null =
    scheduleQuery.data && course.status === "active" ? NextLessonCalculator.next(scheduleQuery.data, course.end_date, new Date()) : null;
  const weekdayName = (index: number): string => t(`weekdays.${index}`);
  const scheduleLine: string = scheduleGroups
    .map(
      (group) =>
        `${group.weekdayIndexes.map(weekdayName).join(" · ")} ${formatTime(group.timeStart, i18n.language)}–${formatTime(group.timeEnd, i18n.language)}`,
    )
    .join("; ");
  const results: CourseResultSummary | null = periodsQuery.data ? CourseResultSummaries.summarize(periodsQuery.data) : null;
  const averagePercentage: number | null = results ? results.averagePercentage : null;
  const hasGrade: boolean = averagePercentage !== null;
  const longDescription: boolean = course.description.length > DESCRIPTION_COLLAPSE_THRESHOLD;
  const averageBand = averagePercentage !== null ? ScoreBand.of(averagePercentage) : null;

  const renderStats = () => {
    if (profileQuery.isLoading) {
      return (
        <div role="status" aria-busy="true" data-testid="stats-skeleton" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-24 rounded-2xl border border-border-warm bg-card motion-safe:animate-pulse" />
          ))}
        </div>
      );
    }
    if (profileQuery.isError && !entry && !results) {
      return (
        <JournalPanelMessage
          tone="error"
          title={t("profileRefreshError")}
          body={t("profileUnavailableBody")}
          retryLabel={t("common:retry")}
          onRetry={() => void profileQuery.refetch()}
        />
      );
    }
    if (!entry && !results) return null;
    const unavailable: string = t("metricUnavailable");
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="course-stats">
        <CourseStatTile
          testId="stat-score"
          icon={<Target className="h-4 w-4" />}
          label={t("myAverage")}
          hint={<InfoTooltip label={t("scoreInfoLabel")}>{t("scoreInfo")}</InfoTooltip>}
          value={averagePercentage !== null ? `${formatNumber(averagePercentage, i18n.language, { maximumFractionDigits: 0 })}%` : results ? t("notGradedYet") : unavailable}
          toneClass={averageBand ? averageBand.textClass : "text-muted"}
        />
        <CourseStatTile
          testId="stat-attendance"
          icon={<CalendarCheck className="h-4 w-4" />}
          label={t("attendance")}
          value={results && results.totalLessons > 0 ? `${formatNumber((results.attendedLessons * 100) / results.totalLessons, i18n.language, { maximumFractionDigits: 0 })}%` : unavailable}
        />
        <CourseStatTile
          testId="stat-absences"
          icon={<UserX className="h-4 w-4" />}
          label={t("absences")}
          value={results && results.totalLessons > 0 ? formatNumber(results.totalLessons - results.attendedLessons, i18n.language) : unavailable}
        />
        <CourseStatTile
          testId="stat-rank"
          icon={<Trophy className="h-4 w-4" />}
          label={t("rankInClass")}
          hint={entry ? <InfoTooltip label={t("rankInfoLabel")}>{t("rankInfo", { average: formatNumber(entry.class_avg_percentage, i18n.language, { maximumFractionDigits: 1 }) })}</InfoTooltip> : undefined}
          value={hasGrade && entry ? t("rankValue", { rank: entry.my_rank, size: entry.class_size }) : unavailable}
        />
      </div>
    );
  };

  const renderPeriods = () => {
    if (periodsQuery.isLoading) {
      return (
        <div role="status" aria-busy="true" data-testid="periods-skeleton" className="flex flex-col divide-y divide-border rounded-2xl border border-border-warm bg-card">
          <span className="sr-only">{t("loadingPeriods")}</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex min-h-14 items-center justify-between px-4">
              <div className="h-4 w-1/3 rounded-md bg-beige-dark motion-safe:animate-pulse" />
              <div className="h-6 w-14 rounded-full bg-beige-dark motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      );
    }
    if (periodsQuery.isError && !periodsQuery.data) {
      return <JournalPanelMessage tone="error" title={t("periodsLoadFailed")} retryLabel={t("common:retry")} onRetry={() => void periodsQuery.refetch()} />;
    }
    const periods = periodsQuery.data ?? [];
    if (periods.length === 0) return <JournalPanelMessage tone="empty" title={t("noPeriods")} body={t("noPeriodsBody")} />;
    return (
      <div className="flex flex-col gap-3">
        {periodsQuery.isError && (
          <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void periodsQuery.refetch() }}>
            {t("journalsRefreshError")}
          </JournalNotice>
        )}
        <CoursePeriodList periods={periods} />
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
      <PageHeader backTo={listHref} backLabel={t("myCoursesTitle")} title={course.title}>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted" data-testid="course-meta">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatSchoolLessonDate(course.start_date, i18n.language)} – {formatSchoolLessonDate(course.end_date, i18n.language)}
          </span>
          {scheduleLine !== "" && (
            <span className="inline-flex items-center gap-1.5 tabular-nums" data-testid="schedule-line">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {scheduleLine}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <TeacherLine mentorId={course.mentor_id} size={28} />
          {nextLesson && (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-info-surface px-3 text-sm font-semibold text-ink tabular-nums" data-testid="next-lesson-chip">
              {t("nextLessonChip", { when: `${weekdayName(nextLesson.weekdayIndex)} ${formatTime(nextLesson.timeStart, i18n.language)}` })}
            </span>
          )}
        </div>
      </PageHeader>

      {renderStats()}

      <section aria-labelledby="periods-heading" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 id="periods-heading" className="text-lg font-semibold leading-7 text-ink">{t("periodsTitle")}</h2>
          <InfoTooltip label={t("periodsInfoLabel")}>{t("periodsInfo")}</InfoTooltip>
        </div>
        {renderPeriods()}
      </section>

      <section aria-label={t("trendTitle")} className="flex flex-col gap-3">
        <JournalProgressView courseId={courseId} readOnlySelfStudentId={userId ?? undefined} />
      </section>

      {course.description.trim() !== "" && (
        <section aria-labelledby="about-heading" className="flex flex-col gap-2">
          <h2 id="about-heading" className="text-lg font-semibold leading-7 text-ink">{t("courseDescription")}</h2>
          <p id={descriptionId} className={`select-text break-words text-sm leading-6 text-muted ${descriptionOpen ? "" : "line-clamp-2"}`}>
            {course.description}
          </p>
          {longDescription && (
            <button
              type="button"
              aria-expanded={descriptionOpen}
              aria-controls={descriptionId}
              onClick={() => setDescriptionOpen((open) => !open)}
              className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent"
            >
              {descriptionOpen ? t("showLess") : t("showMore")}
              <ChevronDown aria-hidden="true" className={`h-4 w-4 ${descriptionOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </section>
      )}
    </div>
  );
}
