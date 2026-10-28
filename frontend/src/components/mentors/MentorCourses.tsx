import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { InitialTile } from "../ui/InitialTile";
import { ListRow } from "../ui/ListRow";
import { formatDate } from "../../i18n/formatters";
import { formatTjs } from "../../lib/money";
import { CourseScheduleGrouper, type ScheduleGroup } from "../../lib/courses/CourseScheduleGrouper";
import { useCourseSchedule } from "../../lib/courses/hooks";
import type { CourseResponse } from "../../lib/courses/types";

interface MentorCourseRowProps {
  course: CourseResponse;
  lng?: string;
}

function MentorCourseRow({ course, lng }: MentorCourseRowProps): JSX.Element {
  const { t } = useTranslation(["mentorProfile", "courses"]);
  const { data: schedules, isLoading } = useCourseSchedule(course.id);
  const groups: ScheduleGroup[] = schedules ? CourseScheduleGrouper.group(schedules) : [];

  return (
    <ListRow
      to={`/courses/${course.id}`}
      action={
        <Link
          to={`/journals/${course.id}`}
          className="inline-flex min-h-[36px] items-center justify-center rounded-[8px] border border-control-border bg-card px-3 text-xs font-medium text-ink hover:bg-strip active:scale-[0.96] motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
        >
          {t("courses.toJournal")}
        </Link>
      }
    >
      <span className="flex min-w-0 items-center gap-3">
        <InitialTile name={course.title} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{course.title}</span>
            <StatusBadge status={course.status} />
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {isLoading && !schedules && (
              <span className="h-5 w-24 animate-pulse rounded bg-strip" />
            )}
            {groups.map((group: ScheduleGroup) => (
              <span
                key={`${group.days.join("-")}-${group.timeStart}-${group.timeEnd}`}
                className="inline-flex items-center rounded-md border border-border bg-strip px-2 py-0.5 font-medium text-ink tabular-nums"
              >
                {group.days.map((day: number): string => t(`courses:weekdayShort.${day}`)).join(", ")}
                {" · "}
                {group.timeStart}–{group.timeEnd}
              </span>
            ))}
            <span className="tabular-nums">
              {formatDate(course.start_date, lng)} – {formatDate(course.end_date, lng)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium tabular-nums text-ink">
              {formatTjs(course.price, { perMonth: true, lng })}
            </span>
          </span>
        </span>
      </span>
    </ListRow>
  );
}

export function MentorCourses({ courses }: { courses: CourseResponse[] }): JSX.Element {
  const { t, i18n } = useTranslation(["mentorProfile", "courses"]);
  if (courses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState title={t("courses.empty")} description={t("courses.emptyHelp")} />
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card p-2">
      {courses.map((course: CourseResponse) => (
        <li key={course.id}>
          <MentorCourseRow course={course} lng={i18n.language} />
        </li>
      ))}
    </ul>
  );
}
