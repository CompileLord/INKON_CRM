import { Link } from "react-router-dom";
import { BookOpen, Calendar, Clock, RefreshCw, AlertCircle, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyStudentProfile, useMyStudentJournals, useMentorProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { PersonAvatar } from "../ui/PersonAvatar";
import {
  formatSchoolLessonWeekday,
  formatSchoolLessonDate,
  formatSchoolLessonTime,
  getSchoolCalendarDate,
  formatNumber,
} from "../../i18n/formatters";
import type { CourseResponse } from "../../lib/courses/types";
import { StudentCourseRow } from "../student/StudentCourseRow";
import { StudentResultCard } from "../student/StudentResultCard";
import { StudentEmptyState } from "../student/StudentEmptyState";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

interface SoonestLessonCardProps {
  course?: CourseResponse;
  nextLessonAt?: string | null;
}

function SoonestLessonCard({ course, nextLessonAt }: SoonestLessonCardProps) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const { data: mentorProfile, isError: isMentorError, isLoading: isMentorLoading } = useMentorProfile(course?.mentor_id);
  const mentorUser = mentorProfile?.user;

  if (!course || !nextLessonAt) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl border border-border-warm bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-beige text-maroon-text">
            <Clock size={20} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              {t("noUpcomingLessonTitle")}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {t("noUpcomingLessonBody")}
            </p>
          </div>
        </div>
        <Link
          to="/my/courses"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border-warm bg-strip px-4 py-2 text-xs font-semibold text-ink hover:bg-card motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring self-start sm:self-auto shrink-0"
        >
          {t("allCoursesLink")}
        </Link>
      </div>
    );
  }

  const weekday = formatSchoolLessonWeekday(nextLessonAt, i18n.language);
  const dateStr = formatSchoolLessonDate(nextLessonAt, i18n.language);
  const timeStr = formatSchoolLessonTime(nextLessonAt, i18n.language);

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border-warm bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("nextLesson")}
        </span>
        <div className="flex items-center gap-1.5 rounded-xl bg-strip px-2.5 py-1 text-base font-semibold text-ink tabular-nums border border-border-warm">
          <Calendar size={13} className="text-muted shrink-0" aria-hidden="true" />
          <span>{weekday}</span>
          <span>·</span>
          <span>{dateStr}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-2xl sm:text-3xl font-bold tabular-nums text-ink">
            {timeStr}
          </div>
          <h3 className="text-base sm:text-lg font-bold text-ink mt-0.5 break-words">
            {course.title}
          </h3>
          {mentorUser ? (
            <div className="flex items-center gap-2 mt-2">
              <PersonAvatar
                firstName={mentorUser.first_name}
                lastName={mentorUser.last_name}
                photoUrl={resolveMediaUrl(mentorUser.thumbnail_path ?? mentorUser.photo_path) ?? undefined}
                size={24}
              />
              <span className="text-xs font-medium text-ink break-words min-w-0">
                {mentorUser.first_name} {mentorUser.last_name}
              </span>
            </div>
          ) : isMentorError ? (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted">
              <UserX size={14} className="text-muted shrink-0" aria-hidden="true" />
              <span>{t("mentorUnavailable")}</span>
            </div>
          ) : isMentorLoading ? <span className="mt-2 block h-6 w-36 rounded bg-strip motion-safe:animate-pulse" /> : <p className="mt-2 text-sm text-muted">{t("mentorUnavailable")}</p>}
        </div>

        <Link
          to={`/my/courses/${course.id}`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-maroon px-4 py-2.5 text-xs font-semibold text-on-primary hover:bg-maroon-dark motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring self-start sm:self-auto shrink-0"
        >
          {t("viewCourse")}
        </Link>
      </div>
    </div>
  );
}

export function StudentDashboard() {
  const { t, i18n } = useTranslation(["student", "common"]);
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    isFetching: isProfileFetching,
    refetch: refetchProfile,
  } = useMyStudentProfile();

  const {
    data: journals,
    isLoading: isJournalsLoading,
    isError: isJournalsError,
    isFetching: isJournalsFetching,
    refetch: refetchJournals,
  } = useMyStudentJournals();

  const user = profile?.user;
  const totals = profile?.totals;
  const courses = profile?.courses ?? [];

  const activeCourses = courses.filter((c) => c.bucket === "active");
  const activeWithLessons = activeCourses
    .filter((c) => c.next_lesson_at !== null)
    .sort((a, b) => new Date(a.next_lesson_at!).getTime() - new Date(b.next_lesson_at!).getTime());
  const soonestLessonCourse = activeWithLessons[0];

  const schoolToday = getSchoolCalendarDate();
  const availablePeriods = (journals ?? []).filter(period => period.period_start <= schoolToday);
  const latestAvailablePeriod = availablePeriods[0];
  const hasLessonPopulation = Boolean(totals && totals.total_lessons > 0);
  const profileUnavailable = !profile && !isProfileLoading;
  const profileRetry = <Button variant="secondary" loading={isProfileFetching} onClick={() => refetchProfile()}>{t("common:retry")}</Button>;
  const profileFailure = <div role="alert" className="flex min-h-32 flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4"><p className="text-sm text-destructive">{t("profileRefreshError")}</p><p className="text-sm text-muted">{t("profileUnavailableBody")}</p>{profileRetry}</div>;

  return (
    <div className="@container flex flex-col gap-5 pb-8">
      {isProfileError && profile && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-warning-surface text-warning border border-warning/30 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-warning shrink-0" aria-hidden="true" />
            <span>{t("profileRefreshError")}</span>
          </div>
          <button
            type="button"
            onClick={() => refetchProfile()}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-3 py-1 rounded-lg border border-warning/40 bg-card hover:bg-strip text-ink motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={12} className={isProfileFetching ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            <span>{t("common:retry")}</span>
          </button>
        </div>
      )}

      <div className="flex flex-col gap-5 @[51.5rem]:grid @[51.5rem]:grid-cols-[minmax(0,1fr)_300px] @[51.5rem]:gap-6 @[51.5rem]:[grid-template-areas:'identity_identity'_'metrics_metrics'_'nextlesson_result'_'courses_result']">
        <header className="@[51.5rem]:[grid-area:identity] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isProfileLoading && !profile ? (
              <div className="flex items-center gap-3 motion-safe:animate-pulse">
                <div className="h-10 w-10 rounded-full bg-strip border border-border-warm" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-7 w-48 rounded bg-strip" />
                  <div className="h-3.5 w-24 rounded bg-strip" />
                </div>
              </div>
            ) : (
              <>
                <PersonAvatar
                  firstName={user?.first_name ?? ""}
                  lastName={user?.last_name ?? ""}
                  photoUrl={resolveMediaUrl(user?.thumbnail_path ?? user?.photo_path) ?? undefined}
                  size={40}
                />
                <div>
                  <h1 className="text-[1.5rem] leading-[2rem] sm:text-[1.75rem] sm:leading-[2.25rem] font-semibold text-ink">
                    {user ? `${user.first_name} ${user.last_name}` : t("studentDashboard")}
                  </h1>
                  <p className="text-xs text-muted mt-0.5">
                    {totals
                      ? t("activeCoursesSummary", { count: totals.active_course_count })
                      : activeCourses.length > 0
                        ? t("activeCoursesSummary", { count: activeCourses.length })
                        : t("profileUnavailableBody")}
                  </p>
                </div>
              </>
            )}
          </div>
        </header>

        <section
          aria-labelledby="next-lesson-heading"
          className="@[51.5rem]:[grid-area:nextlesson]"
        >
          <h2 id="next-lesson-heading" className="sr-only">
            {t("nextLesson")}
          </h2>
          {isProfileLoading && !profile ? (
            <div role="status" aria-busy="true" className="h-44 rounded-2xl border border-border-warm bg-card p-4 motion-safe:animate-pulse"><BrandActivityIndicator size={20} aria-hidden="true" /><span className="sr-only">{t("common:loading")}</span></div>
          ) : profileUnavailable ? (
            <div className="flex flex-col items-start gap-3 p-4 rounded-2xl border border-danger-surface bg-card text-ink">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle size={18} aria-hidden="true" />
                <h3 className="text-sm font-semibold">{t("profileRefreshError")}</h3>
              </div>
              <button
                type="button"
                onClick={() => refetchProfile()}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-border-warm bg-strip px-4 py-2 text-xs font-semibold text-ink hover:bg-card motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw size={14} className={isProfileFetching ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
                <span>{t("common:retry")}</span>
              </button>
            </div>
          ) : (
            <SoonestLessonCard
              course={soonestLessonCourse?.course}
              nextLessonAt={soonestLessonCourse?.next_lesson_at}
            />
          )}
        </section>

        <section
          aria-labelledby="metrics-heading"
          className="@[51.5rem]:[grid-area:metrics]"
        >
          <h2 id="metrics-heading" className="sr-only">
            {t("average")}
          </h2>
          {isProfileLoading && !profile ? (
            <div className="grid grid-cols-2 gap-3 @[40rem]:grid-cols-4 motion-safe:animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-2xl border border-border-warm bg-card" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 @[40rem]:grid-cols-4">
              <div className="rounded-2xl border border-border-warm bg-card p-3 sm:p-4">
                <span className="text-sm font-medium uppercase tracking-wider text-muted block break-words">
                  {t("average")}
                </span>
                <div title={t("gradingStateUnavailableBody")} aria-label={t("gradingStateUnavailable")} className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums text-ink">
                  {t("metricUnavailable")}
                </div>
              </div>

              <div className="rounded-2xl border border-border-warm bg-card p-3 sm:p-4">
                <span className="text-sm font-medium uppercase tracking-wider text-muted block break-words">
                  {t("attendance")}
                </span>
                <div className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums text-ink">
                  {hasLessonPopulation
                    ? formatNumber(totals!.attendance_percentage / 100, i18n.language, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    : t("metricUnavailable")}
                </div>
              </div>

              <div className="rounded-2xl border border-border-warm bg-card p-3 sm:p-4">
                <span className="text-sm font-medium uppercase tracking-wider text-muted block break-words">
                  {t("absences")}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-bold tabular-nums text-ink">
                    {totals ? formatNumber(totals.absences, i18n.language) : t("metricUnavailable")}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {totals ? t("ofLessons", { total: formatNumber(totals.total_lessons, i18n.language) }) : t("profileUnavailableBody")}
                  </span>
                </div>
              </div>

              <Link
                to="/my/courses"
                className="group rounded-2xl border border-border-warm bg-card p-3 sm:p-4 hover:bg-row-hover motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col justify-between min-h-[44px]"
              >
                <span className="text-sm font-medium uppercase tracking-wider text-muted block break-words">
                  {t("activeCoursesCount")}
                </span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-2xl sm:text-3xl font-bold tabular-nums text-ink">
                    {totals ? formatNumber(totals.active_course_count, i18n.language) : t("metricUnavailable")}
                  </span>
                  <span className="text-xs font-semibold text-maroon-text hover:underline">
                    {t("allCoursesLink")}
                  </span>
                </div>
              </Link>
            </div>
          )}
        </section>

        <section
          aria-labelledby="courses-heading"
          className="@[51.5rem]:[grid-area:courses] flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h2 id="courses-heading" className="text-base font-bold text-ink flex items-center gap-2">
              <BookOpen size={18} className="text-maroon-text" aria-hidden="true" />
              <span>{t("myCourses")}</span>
            </h2>
            <Link
              to="/my/courses"
              className="text-xs font-semibold text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded min-h-[44px] flex items-center"
            >
              {t("allCoursesLink")}
            </Link>
          </div>

          {isProfileLoading && !profile ? (
            <div className="flex flex-col gap-3 motion-safe:animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl border border-border-warm bg-card" />
              ))}
            </div>
          ) : profileUnavailable ? profileFailure : activeCourses.length === 0 ? (
            <StudentEmptyState
              title={t("noCoursesTitle")}
              body={t("noCoursesBody")}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {activeCourses.slice(0, 3).map((entry) => (
                <StudentCourseRow key={entry.course.id} entry={entry} />
              ))}
            </div>
          )}
        </section>

        <section
          aria-labelledby="result-heading"
          className="@[51.5rem]:[grid-area:result] flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h2 id="result-heading" className="text-base font-bold text-ink">
              {t("latestPeriodResult")}
            </h2>
          </div>

          <StudentResultCard
            journal={latestAvailablePeriod}
            hasLoadedData={journals !== undefined}
            hasUpcomingPeriods={(journals?.length ?? 0) > 0 && availablePeriods.length === 0}
            isLoading={isJournalsLoading}
            isError={isJournalsError}
            isRefetching={isJournalsFetching}
            onRetry={() => refetchJournals()}
          />
        </section>
      </div>
    </div>
  );
}
