import React from "react";
import { BookOpen, Users, ClipboardCheck, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyMentorProfile } from "../../lib/users/hooks";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { useCourses } from "../../lib/courses/hooks";

const labelClass = "text-sm leading-5 font-normal text-muted break-words";
const valueClass = "mt-1 text-[1.75rem] leading-9 font-bold tabular-nums text-ink";
const retryButtonClass = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink bg-card border border-control-border rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";
const smallRetryButtonClass = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 py-1 text-xs font-semibold text-ink bg-card border border-control-border rounded [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon";

export const MentorStatsStrip: React.FC = () => {
  const { t } = useTranslation(["journals", "dashboard", "common"]);
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    isFetching: profileFetching,
    refetch: refetchProfile,
  } = useMyMentorProfile();

  const {
    data: activeCoursesPage,
    isLoading: coursesLoading,
    isError: coursesError,
    isFetching: coursesFetching,
    refetch: refetchCourses,
  } = useCourses({ status: "active" });

  const {
    data: queue,
    isLoading: queueLoading,
    isError: queueError,
    isFetching: queueFetching,
    refetch: refetchQueue,
  } = useMentorGradingQueue();

  const activeCoursesCount = activeCoursesPage ? (activeCoursesPage.total ?? activeCoursesPage.items.length) : undefined;
  const needsGradingCount = queue ? queue.length : undefined;
  const activeStudentsCount = profile?.active_students_count;

  return (
    <section
      aria-labelledby="mentor-summary-heading"
      className="rounded-2xl border border-border-warm bg-card p-4 sm:p-6 shadow-sm"
    >
      <h2 id="mentor-summary-heading" className="sr-only">
        {t("dashboard:summaryTitle", "Summary")}
      </h2>

      <div className="flex flex-col gap-3 md:gap-0 md:grid md:grid-cols-3 md:divide-x md:divide-border-warm/60">
        <div className="grid grid-cols-2 divide-x divide-border-warm/60 md:contents">
          <div className="flex flex-col justify-center pr-3 md:pr-0 md:px-5">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-maroon shrink-0" />
              <span className={labelClass}>{t("journals:mentorStats.myCourses")}</span>
            </div>
            {coursesLoading && activeCoursesCount === undefined ? (
              <div className="mt-2 h-9 w-16 rounded bg-strip motion-safe:animate-pulse" />
            ) : coursesError && activeCoursesCount === undefined ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-destructive font-medium">
                  {t("journals:mentorStats.coursesUnavailable")}
                </span>
                <button
                  type="button"
                  onClick={() => refetchCourses()}
                  className={retryButtonClass}
                  aria-label={`${t("common:retry")} ${t("journals:mentorStats.myCourses")}`}
                >
                  <RefreshCw size={12} className={coursesFetching ? "motion-safe:animate-spin" : ""} />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                <p className={valueClass}>{activeCoursesCount}</p>
                {coursesError && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{t("dashboard:staleFailedNotice")}</span>
                    <button
                      type="button"
                      onClick={() => refetchCourses()}
                      className={smallRetryButtonClass}
                    >
                      <RefreshCw size={12} className={coursesFetching ? "motion-safe:animate-spin" : ""} />
                      <span>{t("common:retry")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center pl-3 md:pl-0 md:px-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} className="text-maroon shrink-0" />
              <span className={labelClass}>{t("journals:mentorStats.periodsNeedingGrading")}</span>
            </div>
            {queueLoading && needsGradingCount === undefined ? (
              <div className="mt-2 h-9 w-16 rounded bg-strip motion-safe:animate-pulse" />
            ) : queueError && needsGradingCount === undefined ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-destructive font-medium">
                  {t("journals:mentorStats.queueUnavailable")}
                </span>
                <button
                  type="button"
                  onClick={() => refetchQueue()}
                  className={retryButtonClass}
                  aria-label={`${t("common:retry")} ${t("journals:mentorStats.periodsNeedingGrading")}`}
                >
                  <RefreshCw size={12} className={queueFetching ? "motion-safe:animate-spin" : ""} />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                <p className={valueClass}>{needsGradingCount}</p>
                {queueError && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span>{t("dashboard:staleFailedNotice")}</span>
                    <button
                      type="button"
                      onClick={() => refetchQueue()}
                      className={smallRetryButtonClass}
                    >
                      <RefreshCw size={12} className={queueFetching ? "motion-safe:animate-spin" : ""} />
                      <span>{t("common:retry")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border-warm/60 pt-3 md:border-t-0 md:pt-0 md:px-5 flex flex-col justify-center">
          {profileLoading && activeStudentsCount === undefined ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-muted shrink-0" />
                <span className={labelClass}>{t("journals:mentorStats.myStudents")}</span>
              </div>
              <div className="mt-2 h-9 w-16 rounded bg-strip motion-safe:animate-pulse" />
            </div>
          ) : profileError && activeStudentsCount === undefined ? (
            <div className="flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <AlertCircle size={14} className="text-muted shrink-0" />
                <span>{t("journals:mentorStats.studentsUnavailable")}</span>
                <button
                  type="button"
                  onClick={() => refetchProfile()}
                  className={retryButtonClass}
                  aria-label={`${t("common:retry")} ${t("journals:mentorStats.myStudents")}`}
                >
                  <RefreshCw size={12} className={profileFetching ? "motion-safe:animate-spin" : ""} />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-maroon shrink-0" />
                <span className={labelClass}>{t("journals:mentorStats.myStudents")}</span>
              </div>
              <p className={valueClass}>{activeStudentsCount}</p>
              {profileError && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>{t("dashboard:staleFailedNotice")}</span>
                  <button
                    type="button"
                    onClick={() => refetchProfile()}
                    className={smallRetryButtonClass}
                  >
                    <RefreshCw size={12} className={profileFetching ? "motion-safe:animate-spin" : ""} />
                    <span>{t("common:retry")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
