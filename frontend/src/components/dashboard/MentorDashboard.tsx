import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, BookOpen, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { MentorStatsStrip } from "../mentor/MentorStatsStrip";
import { GradingQueueRow } from "../mentor/GradingQueueRow";
import { CardSkeleton } from "../ui/CardSkeleton";

export const MentorDashboard: React.FC = () => {
  const { t } = useTranslation(["dashboard", "journals", "common"]);
  const { data: coursesData, isLoading: coursesLoading, isError: coursesError, refetch: refetchCourses } = useCourses({ status: "active" });
  const { data: queue, isLoading: queueLoading, isError: queueError, refetch: refetchQueue } = useMentorGradingQueue();

  const courses = coursesData?.items ?? [];

  const todayDayOfWeek = (new Date().getDay() + 6) % 7;
  const todaysCourses = courses.filter((c) =>
    c.schedules?.some((s) => s.day_of_week === todayDayOfWeek)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">{t("teacherDashboard")}</h1>
            <p className="text-xs text-muted mt-0.5">{t("teacherSubtitle")}</p>
          </div>
        </div>
        <MentorStatsStrip />
      </div>

      <div className="rounded-2xl border border-border-warm bg-card p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-ink">{t("needsGrading")}</h2>
            {queue && queue.length > 0 && (
              <span className="rounded-full bg-strip px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted border border-border-warm">
                {queue.length}
              </span>
            )}
          </div>
        </div>

        {queueLoading ? (
          <CardSkeleton rows={2} />
        ) : queueError ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle size={20} className="text-red-600 dark:text-red-400 mb-2" />
            <p className="text-xs text-muted mb-2">{t("journals:loadFailed")}</p>
            <button
              type="button"
              onClick={() => refetchQueue()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-strip transition-colors"
            >
              <RefreshCw size={12} /> {t("common:retry")}
            </button>
          </div>
        ) : !queue || queue.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{t("everythingGraded")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {queue.map((item) => (
              <GradingQueueRow key={item.journal_id} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-warm bg-card p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Clock size={16} className="text-maroon dark:text-accent" /> {t("todaysSchedule")}
            </h3>
            <span className="text-xs text-muted tabular-nums">
              {todaysCourses.length} {t("myGroupsAndCourses").toLowerCase()}
            </span>
          </div>

          {coursesLoading ? (
            <CardSkeleton rows={2} />
          ) : todaysCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted">
              <Clock size={28} className="text-muted/50 mb-2" />
              <p className="text-xs">{t("noClassesToday")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todaysCourses.map((course) => {
                const todaySchedule = course.schedules?.find((s) => s.day_of_week === todayDayOfWeek);
                return (
                  <div
                    key={course.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-warm bg-card hover:bg-row-hover transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-ink">{course.title}</span>
                      <span className="text-xs text-muted mt-0.5">
                        {todaySchedule ? `${todaySchedule.time_start.slice(0, 5)} - ${todaySchedule.time_end.slice(0, 5)}` : ""}
                        {todaySchedule?.room_name ? ` • ${t("room", { room: todaySchedule.room_name })}` : ""}
                      </span>
                    </div>
                    <Link
                      to={`/journals/${course.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-maroon/10 text-maroon dark:bg-accent/10 dark:text-accent px-3 py-1.5 text-xs font-semibold hover:bg-maroon/20 transition-colors w-fit"
                    >
                      <BookOpen size={14} /> {t("openJournal")}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border-warm bg-card p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <BookOpen size={16} className="text-blue-600 dark:text-blue-400" /> {t("myActiveCourses")}
            </h3>
            <Link to="/journals" className="text-xs font-medium text-maroon dark:text-accent hover:underline flex items-center gap-1">
              {t("journals:hubTitle")} <ChevronRight size={14} />
            </Link>
          </div>

          {coursesLoading ? (
            <CardSkeleton rows={2} />
          ) : coursesError ? (
            <div className="py-6 text-center text-xs">
              <p className="text-rose-600 font-semibold mb-2">{t("journals:loadFailedCourse")}</p>
              <button
                type="button"
                onClick={() => refetchCourses()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-strip"
              >
                <RefreshCw size={12} /> {t("common:retry")}
              </button>
            </div>
          ) : courses.length === 0 ? (
            <p className="text-xs text-muted py-4">{t("noActiveGroups")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border-warm bg-card hover:bg-row-hover transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-ink">{c.title}</span>
                    <span className="text-xs text-muted">
                      {t(`common:enums.examType.${c.exam_type}`, c.exam_type)}
                    </span>
                  </div>
                  <Link
                    to={`/journals/${c.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-maroon dark:text-accent hover:underline"
                  >
                    {t("openJournal")} <ChevronRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
