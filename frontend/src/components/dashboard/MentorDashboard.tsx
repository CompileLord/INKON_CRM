import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, AlertCircle, RefreshCw, ChevronRight, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MentorStatsStrip } from "../mentor/MentorStatsStrip";
import { GradingQueueRow } from "../mentor/GradingQueueRow";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { useCourses } from "../../lib/courses/hooks";

const retryButtonClass = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-ink bg-card border border-control-border rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";
const staleRetryButtonClass = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-3 py-1.5 text-xs font-semibold text-ink bg-card border border-control-border rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";

const MentorQueueSkeleton: React.FC = () => {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t("loading")}</span>
      {[1, 2].map((idx) => (
        <div
          key={idx}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-warm bg-card shadow-sm motion-safe:animate-pulse"
        >
          <div className="flex flex-col min-w-0 flex-1 gap-2">
            <div className="h-4 w-40 rounded bg-strip" />
            <div className="h-3 w-24 rounded bg-strip" />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
            <div className="h-3 w-20 rounded bg-strip" />
            <div className="h-6 w-16 rounded-full bg-strip" />
            <div className="h-[44px] w-28 rounded-lg bg-strip" />
          </div>
        </div>
      ))}
    </div>
  );
};

const MentorCoursesSkeleton: React.FC = () => {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-1 @[656px]:grid-cols-2 gap-4">
      <span className="sr-only">{t("loading")}</span>
      {[1, 2].map((idx) => (
        <div
          key={idx}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-warm bg-card shadow-sm motion-safe:animate-pulse min-w-0"
        >
          <div className="flex flex-col min-w-0 flex-1 gap-2">
            <div className="h-4 w-44 rounded bg-strip" />
            <div className="h-3 w-28 rounded bg-strip" />
          </div>
          <div className="w-full sm:w-28 h-[44px] rounded-lg bg-strip shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const MentorDashboard: React.FC = () => {
  const { t } = useTranslation(["dashboard", "journals", "common"]);

  const {
    data: queue,
    isLoading: queueLoading,
    isError: queueError,
    isFetching: queueFetching,
    refetch: refetchQueue,
  } = useMentorGradingQueue();

  const {
    data: coursesData,
    isLoading: coursesLoading,
    isError: coursesError,
    isFetching: coursesFetching,
    refetch: refetchCourses,
  } = useCourses({ status: "active" });

  const courses = coursesData?.items ?? [];

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-2xl leading-8 sm:text-[1.75rem] sm:leading-9 font-semibold text-ink">
          {t("dashboard:teacherDashboard")}
        </h1>
        <p className="text-sm leading-5 text-muted mt-1">
          {t("dashboard:teacherSubtitle")}
        </p>
      </div>

      <MentorStatsStrip />

      <section
        aria-labelledby="grading-queue-heading"
        className="rounded-2xl border border-border-warm bg-card p-4 sm:p-6 shadow-sm flex flex-col gap-3 sm:gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 id="grading-queue-heading" className="text-lg leading-[1.625rem] font-bold text-ink">
              {t("dashboard:needsGrading")}
            </h2>
            {queue && queue.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-strip px-2.5 py-0.5 text-xs font-semibold tabular-nums text-maroon-text border border-border-warm">
                {queue.length}
              </span>
            )}
          </div>
        </div>

        {queueLoading && queue === undefined ? (
          <MentorQueueSkeleton />
        ) : queueError && queue === undefined ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle size={20} className="text-destructive mb-2" />
            <p className="text-xs text-muted mb-3">{t("journals:loadFailed")}</p>
            <button
              type="button"
              onClick={() => refetchQueue()}
              className={retryButtonClass}
            >
              <RefreshCw size={14} className={queueFetching ? "motion-safe:animate-spin" : ""} />
              <span>{t("common:retry")}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!queue || queue.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-strip p-4 text-ink">
                <CheckCircle2 size={20} className="text-success shrink-0" />
                <span className="text-sm font-medium text-ink">{t("dashboard:everythingGraded")}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {queue.map((item) => (
                  <GradingQueueRow key={item.journal_id} item={item} />
                ))}
              </div>
            )}
            {queueError && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted pt-2 border-t border-border-warm/40">
                <span>{t("dashboard:queueUpdateFailed")}</span>
                <button
                  type="button"
                  onClick={() => refetchQueue()}
                  className={staleRetryButtonClass}
                >
                  <RefreshCw size={12} className={queueFetching ? "motion-safe:animate-spin" : ""} />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="active-courses-heading"
        className="@container rounded-2xl border border-border-warm bg-card p-4 sm:p-6 shadow-sm flex flex-col gap-3 sm:gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="active-courses-heading" className="text-lg leading-[1.625rem] font-bold text-ink flex items-center gap-2">
            <BookOpen size={18} className="text-maroon-text shrink-0" />
            <span>{t("dashboard:myActiveCourses")}</span>
          </h2>
          <Link
            to="/journals"
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-maroon-text [@media(hover:hover)_and_(pointer:fine)]:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded px-1"
          >
            <span>{t("journals:hubTitle")}</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {coursesLoading && coursesData === undefined ? (
          <MentorCoursesSkeleton />
        ) : coursesError && coursesData === undefined ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle size={20} className="text-destructive mb-2" />
            <p className="text-xs text-muted mb-3">{t("journals:loadFailedCourse")}</p>
            <button
              type="button"
              onClick={() => refetchCourses()}
              className={retryButtonClass}
            >
              <RefreshCw size={14} className={coursesFetching ? "motion-safe:animate-spin" : ""} />
              <span>{t("common:retry")}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {courses.length === 0 ? (
              <div className="rounded-xl border border-border-warm bg-strip/50 p-4 text-center">
                <p className="text-xs font-semibold text-ink">{t("dashboard:noActiveGroups")}</p>
                <p className="text-xs text-muted mt-1">{t("dashboard:noActiveGroupsHelp")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 @[656px]:grid-cols-2 gap-4">
                {courses.map((course) => (
                  <div
                    key={course.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-warm bg-card shadow-sm min-w-0"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-semibold text-ink break-words">{course.title}</span>
                      <span className="text-xs text-muted mt-0.5 break-words">
                        {t(`common:enums.examType.${course.exam_type}`, course.exam_type)}
                      </span>
                    </div>
                    <Link
                      to={`/journals/${course.id}`}
                      className="w-full sm:w-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-card border border-control-border text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 shrink-0"
                      aria-label={`${t("dashboard:openJournal")}: ${course.title}`}
                    >
                      <span>{t("dashboard:openJournal")}</span>
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
            {coursesError && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted pt-2 border-t border-border-warm/40">
                <span>{t("dashboard:coursesUpdateFailed")}</span>
                <button
                  type="button"
                  onClick={() => refetchCourses()}
                  className={staleRetryButtonClass}
                >
                  <RefreshCw size={12} className={coursesFetching ? "motion-safe:animate-spin" : ""} />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
