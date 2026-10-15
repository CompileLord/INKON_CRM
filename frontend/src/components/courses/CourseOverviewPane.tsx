import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import {
  useCourseJournalMetrics,
  useCourseMentorHistory,
  useCourseSchedule,
} from "../../lib/courses/hooks";
import { useCourseEnrollmentsCount } from "../../lib/enrollments/hooks";
import { CourseDetailMetricsStrip } from "./CourseDetailMetricsStrip";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { formatDate, formatTime } from "../../i18n/formatters";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseOverviewPaneProps {
  course: CourseResponse;
  isSuperAdmin: boolean;
  onReady?: () => void;
}

export function CourseOverviewPane({
  course,
  isSuperAdmin,
  onReady,
}: CourseOverviewPaneProps) {
  const { t } = useTranslation(["courses", "common"]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useEffect(() => {
    setIsHistoryOpen(false);
  }, [course.id]);

  const {
    data: enrollmentsTotal,
    isLoading: isEnrollmentsLoading,
    isError: isEnrollmentsError,
    refetch: refetchEnrollments,
  } = useCourseEnrollmentsCount(course.id);

  const {
    data: journalMetrics,
    isLoading: isMetricsLoading,
    isError: isMetricsError,
    refetch: refetchMetrics,
  } = useCourseJournalMetrics(course.id);

  const {
    data: schedule,
    isLoading: isScheduleLoading,
    isFetching: isScheduleFetching,
    isError: isScheduleError,
    refetch: refetchSchedule,
  } = useCourseSchedule(course.id);

  const {
    data: mentorHistory,
    isLoading: isHistoryLoading,
    isFetching: isHistoryFetching,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useCourseMentorHistory(course.id, isSuperAdmin && isHistoryOpen);

  const isSettled = !isEnrollmentsLoading && !isMetricsLoading && !isScheduleLoading;

  useEffect(() => {
    if (isSettled) {
      onReady?.();
    }
  }, [isSettled, onReady]);

  const dayLabels = [
    t("days.monFull"),
    t("days.tueFull"),
    t("days.wedFull"),
    t("days.thuFull"),
    t("days.friFull"),
    t("days.satFull"),
    t("days.sunFull"),
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
      <CourseDetailMetricsStrip
        enrollmentsTotal={enrollmentsTotal}
        isEnrollmentsLoading={isEnrollmentsLoading}
        isEnrollmentsError={isEnrollmentsError}
        onRetryEnrollments={() => refetchEnrollments()}
        journalMetrics={journalMetrics}
        isMetricsLoading={isMetricsLoading}
        isMetricsError={isMetricsError}
        onRetryMetrics={() => refetchMetrics()}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start min-w-0 max-w-full">
        <div className="md:col-span-2 rounded-2xl border border-border-warm bg-card p-4 sm:p-5 md:p-6 shadow-xs min-w-0">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink">
                {t("schedule")}
              </h2>
              {isScheduleFetching && !isScheduleLoading ? (
                <BrandActivityIndicator size={13} className="text-muted" />
              ) : null}
            </div>
          </div>

          <div className="mt-4 min-w-0">
            {isScheduleError && schedule ? (
              <div
                role="alert"
                className="mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20"
              >
                <span>{t("scheduleLoadError")}</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => refetchSchedule()}
                  className="min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs gap-1"
                >
                  <RotateCcw size={13} />
                  <span>{t("common:retry")}</span>
                </Button>
              </div>
            ) : null}

            {isScheduleLoading && !schedule ? (
              <div className="flex flex-col gap-2.5">
                {[1, 2, 3].map((key) => (
                  <div
                    key={key}
                    className="h-11 rounded-xl bg-strip motion-safe:animate-pulse flex items-center px-4"
                  >
                    <BrandActivityIndicator size={16} />
                  </div>
                ))}
              </div>
            ) : isScheduleError && !schedule ? (
              <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                <p className="text-sm text-destructive">
                  {t("scheduleLoadError")}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => refetchSchedule()}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  <span>{t("common:retry")}</span>
                </Button>
              </div>
            ) : !schedule || schedule.length === 0 ? (
              <p className="py-4 text-base sm:text-sm text-muted">
                {t("noSchedule")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2 min-w-0">
                {schedule.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap sm:flex-nowrap min-h-[44px] items-center justify-between rounded-xl bg-strip border border-border px-3.5 sm:px-4 py-2.5 gap-2 min-w-0"
                  >
                    <span className="font-medium text-ink break-words min-w-0 text-base sm:text-sm leading-6 sm:leading-5">
                      {dayLabels[row.day_of_week] ?? row.day_of_week}
                    </span>
                    <span className="font-mono text-base sm:text-xs font-semibold tabular-nums text-nav leading-6 sm:leading-5 break-words min-w-0">
                      {formatTime(row.time_start)} – {formatTime(row.time_end)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="md:col-span-1 rounded-2xl border border-border-warm bg-card p-4 sm:p-5 md:p-6 shadow-xs min-w-0">
          <h2 className="text-base font-semibold text-ink pb-3 border-b border-border">
            {t("form.descriptionLabel")}
          </h2>
          <div className="mt-4 min-w-0">
            {course.description && course.description.trim().length > 0 ? (
              <p className="text-base sm:text-sm text-ink leading-relaxed break-words whitespace-pre-line">
                {course.description}
              </p>
            ) : (
              <p className="text-base sm:text-sm text-muted">
                {t("noDescription")}
              </p>
            )}
          </div>
        </div>
      </div>

      {isSuperAdmin ? (
        <div className="rounded-2xl border border-border-warm bg-card overflow-hidden shadow-xs min-w-0">
          <button
            type="button"
            aria-expanded={isHistoryOpen}
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            className="flex w-full min-h-[44px] items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 text-left font-semibold text-ink hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon min-w-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="break-words">{t("mentorHistoryDisclosure")}</span>
              {isHistoryFetching && !isHistoryLoading ? (
                <BrandActivityIndicator size={13} className="text-muted" />
              ) : null}
            </div>
            {isHistoryOpen ? (
              <ChevronUp size={18} className="text-muted shrink-0 ml-2" />
            ) : (
              <ChevronDown size={18} className="text-muted shrink-0 ml-2" />
            )}
          </button>

          {isHistoryOpen ? (
            <div className="border-t border-border p-4 sm:p-6 min-w-0">
              {isHistoryError && mentorHistory ? (
                <div
                  role="alert"
                  className="mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20"
                >
                  <span>{t("mentorHistoryLoadError")}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => refetchHistory()}
                    className="min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs gap-1"
                  >
                    <RotateCcw size={13} />
                    <span>{t("common:retry")}</span>
                  </Button>
                </div>
              ) : null}

              {isHistoryLoading && !mentorHistory ? (
                <div className="flex flex-col gap-3">
                  {[1, 2].map((key) => (
                    <div
                      key={key}
                      className="h-14 rounded-xl bg-strip motion-safe:animate-pulse flex items-center px-4"
                    >
                      <BrandActivityIndicator size={16} />
                    </div>
                  ))}
                </div>
              ) : isHistoryError && !mentorHistory ? (
                <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                  <p className="text-sm text-destructive">
                    {t("mentorHistoryLoadError")}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => refetchHistory()}
                    className="min-h-[44px] min-w-[44px]"
                  >
                    <RotateCcw size={14} className="mr-1.5" />
                    <span>{t("common:retry")}</span>
                  </Button>
                </div>
              ) : !mentorHistory || mentorHistory.length === 0 ? (
                <p className="py-2 text-base sm:text-sm text-muted">
                  {t("noMentorHistory")}
                </p>
              ) : (
                <ul id="mentor-history-list" className="flex flex-col gap-2.5 min-w-0">
                  {mentorHistory.map((entry) => {
                    const startFormatted = formatDate(entry.assigned_from);
                    const endFormatted = entry.assigned_to
                      ? formatDate(entry.assigned_to)
                      : null;
                    const rangeLabel = endFormatted
                      ? `${startFormatted} – ${endFormatted}`
                      : t("assignedFromPresent", { start: startFormatted });

                    return (
                      <li
                        key={entry.id}
                        className="flex min-h-[44px] items-center gap-3.5 rounded-xl bg-strip border border-border px-3.5 sm:px-4 py-3 min-w-0"
                      >
                        <PersonAvatar
                          firstName={entry.mentor.first_name}
                          lastName={entry.mentor.last_name}
                          size={32}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink break-words">
                            {entry.mentor.first_name} {entry.mentor.last_name}
                          </p>
                          <p className="text-xs text-muted tabular-nums">
                            {rangeLabel}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
