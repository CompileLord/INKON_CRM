import { CalendarClock, AlertCircle, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { useMentors } from "../../lib/users/hooks";
import { TodayLessonsSelector, type TodayLesson } from "../../lib/courses/TodayLessonsSelector";
import { formatTime, getSchoolCalendarDate, getSchoolWeekdayIndex } from "../../i18n/formatters";
import type { User } from "../../lib/users/types";

interface TodayLessonsProps {
  showMentor: boolean;
}

const actionClass: string =
  "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-control-border bg-card px-3 py-2 text-xs font-semibold text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";

export function TodayLessons({ showMentor }: TodayLessonsProps) {
  const { t } = useTranslation(["dashboard", "courses", "common"]);
  const { data, isLoading, isError, isFetching, refetch } = useCourses({ status: "active", page_size: 100 });
  const { data: mentorsPage } = useMentors({ page_size: 100 }, showMentor);

  const now: Date = new Date();
  const lessons: TodayLesson[] = TodayLessonsSelector.select(
    data?.items ?? [],
    getSchoolCalendarDate(now),
    getSchoolWeekdayIndex(now),
  );
  const mentorNameById: Map<number, string> = new Map(
    (mentorsPage?.items ?? []).map((mentor: User): [number, string] => [
      mentor.id,
      `${mentor.first_name} ${mentor.last_name}`.trim(),
    ]),
  );

  return (
    <section
      aria-labelledby="today-lessons-heading"
      className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-4 shadow-sm sm:gap-4 sm:p-6"
    >
      <h2 id="today-lessons-heading" className="flex items-center gap-2 text-lg font-bold leading-[1.625rem] text-ink">
        <CalendarClock size={18} className="shrink-0 text-maroon-text" aria-hidden="true" />
        <span>{t("dashboard:todayLessons")}</span>
      </h2>

      {data === undefined && isLoading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{t("common:loading")}</span>
          {[0, 1].map((index) => (
            <div
              key={index}
              className="flex flex-col justify-between gap-3 rounded-xl border border-border-warm bg-card p-4 motion-safe:animate-pulse sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-4">
                <div className="h-4 w-24 rounded bg-strip" />
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-40 rounded bg-strip" />
                  <div className="h-3 w-24 rounded bg-strip" />
                </div>
              </div>
              <div className="h-[44px] w-full rounded-lg bg-strip sm:w-28" />
            </div>
          ))}
        </div>
      ) : data === undefined && isError ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlertCircle size={20} className="mb-2 text-destructive" aria-hidden="true" />
          <p className="mb-3 text-xs text-muted">{t("dashboard:todayLessonsLoadFailed")}</p>
          <button type="button" onClick={() => refetch()} className={actionClass}>
            <RefreshCw size={14} className={isFetching ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            <span>{t("common:retry")}</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lessons.length === 0 ? (
            <div className="rounded-xl border border-border-warm bg-strip/50 p-4 text-center">
              <p className="text-xs font-semibold text-ink">{t("dashboard:noLessonsToday")}</p>
              <p className="mt-1 text-xs text-muted">{t("dashboard:noLessonsTodayHelp")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {lessons.map((lesson) => (
                <li
                  key={`${lesson.courseId}-${lesson.timeStart}`}
                  className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-border-warm bg-card p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <span className="shrink-0 text-sm font-bold tabular-nums text-maroon-text">
                      {formatTime(lesson.timeStart)}–{formatTime(lesson.timeEnd)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="break-words text-sm font-semibold text-ink">{lesson.title}</span>
                      <span className="break-words text-xs text-muted">
                        {showMentor && mentorNameById.get(lesson.mentorId) ? (
                          <>
                            {mentorNameById.get(lesson.mentorId)}
                            {" · "}
                          </>
                        ) : null}
                        <span className="tabular-nums">
                          {t("courses:studentsCount", { count: lesson.activeStudentCount })}
                        </span>
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/journals/${lesson.courseId}`}
                    aria-label={`${t("dashboard:openJournal")}: ${lesson.title}`}
                    className={`${actionClass} w-full sm:w-auto`}
                  >
                    <span>{t("dashboard:openJournal")}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {isError ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-warm/40 pt-2 text-xs text-muted">
              <span>{t("dashboard:todayLessonsUpdateFailed")}</span>
              <button type="button" onClick={() => refetch()} className={actionClass}>
                <RefreshCw size={12} className={isFetching ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
                <span>{t("common:retry")}</span>
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
