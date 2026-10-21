import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCourseJournalMetrics, useCourseSchedule } from "../../lib/courses/hooks";
import { useCourseEnrollmentsCount } from "../../lib/enrollments/hooks";
import { Button } from "../ui/Button";
import { SectionCard } from "../ui/SectionCard";
import { CourseDetailMetricsStrip } from "./CourseDetailMetricsStrip";
import { CourseMentorHistory } from "./CourseMentorHistory";
import { ScheduleSummary } from "./ScheduleSummary";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseOverviewPaneProps {
  course: CourseResponse;
  isSuperAdmin: boolean;
  onReady?: () => void;
}

export function CourseOverviewPane({ course, isSuperAdmin, onReady }: CourseOverviewPaneProps) {
  const { t } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");
  const enrollments = useCourseEnrollmentsCount(course.id);
  const metrics = useCourseJournalMetrics(course.id);
  const schedule = useCourseSchedule(course.id);

  const isSettled: boolean = !enrollments.isLoading && !metrics.isLoading && !schedule.isLoading;
  useEffect(() => {
    if (isSettled) onReady?.();
  }, [isSettled, onReady]);

  const scheduleLine: string | null = schedule.data && schedule.data.length > 0
    ? ScheduleSummary.line(schedule.data, (day: number) => t(`weekdayShort.${day}`))
    : null;
  const hasDescription: boolean = Boolean(course.description && course.description.trim().length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CourseDetailMetricsStrip
        enrollmentsTotal={enrollments.data}
        isEnrollmentsLoading={enrollments.isLoading}
        isEnrollmentsError={enrollments.isError}
        onRetryEnrollments={() => enrollments.refetch()}
        journalMetrics={metrics.data}
        isMetricsLoading={metrics.isLoading}
        isMetricsError={metrics.isError}
        onRetryMetrics={() => metrics.refetch()}
      />

      <SectionCard title={t("overview.title")}>
        <dl className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("overview.schedule")}</dt>
            <dd className="m-0 text-sm text-ink">
              {schedule.isLoading && !schedule.data ? (
                <span aria-busy="true" className="block h-5 w-56 rounded bg-strip motion-safe:animate-pulse" />
              ) : schedule.isError && !schedule.data ? (
                <span role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
                  <span>{t("overview.scheduleLoadError")}</span>
                  <Button type="button" variant="secondary" onClick={() => schedule.refetch()}>{tCommon("retry")}</Button>
                </span>
              ) : scheduleLine !== null ? (
                <span className="tabular-nums">{scheduleLine}</span>
              ) : (
                <span className="text-muted">{t("overview.noSchedule")}</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("overview.description")}</dt>
            <dd className="m-0 whitespace-pre-line break-words text-sm leading-relaxed text-ink">
              {hasDescription ? course.description : <span className="text-muted">{t("overview.noDescription")}</span>}
            </dd>
          </div>
        </dl>
        {schedule.isError && schedule.data ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{t("overview.scheduleLoadError")}</span>
            <Button type="button" variant="secondary" onClick={() => schedule.refetch()}>{tCommon("retry")}</Button>
          </p>
        ) : null}
      </SectionCard>

      {isSuperAdmin ? <CourseMentorHistory courseId={course.id} /> : null}
    </div>
  );
}
