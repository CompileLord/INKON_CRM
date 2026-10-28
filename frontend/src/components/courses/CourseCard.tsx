import type { JSX } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Clock, Users } from "lucide-react";
import { formatTjs } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { CourseScheduleGrouper, type ScheduleGroup } from "../../lib/courses/CourseScheduleGrouper";
import { StatusBadge } from "../ui/Badge";
import { Menu } from "../ui/Menu";
import { CourseThumb } from "./CourseThumb";
import { useCourseMenu, type CourseMenuHandlers } from "./useCourseMenu";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseCardProps {
  course: CourseListItemResponse;
  mentor?: User;
  isMentor: boolean;
  menuHandlers: CourseMenuHandlers | null;
  onNavigate?: () => void;
}

export function CourseCard({ course, mentor, isMentor, menuHandlers, onNavigate }: CourseCardProps): JSX.Element {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const menu = useCourseMenu(course, menuHandlers);
  const mentorName: string | null = mentor ? `${mentor.first_name} ${mentor.last_name}`.trim() : null;
  const groups: ScheduleGroup[] = CourseScheduleGrouper.group(course.schedules);
  const isArchived: boolean = course.status === "archived";

  return (
    <div
      ref={menu.rootRef}
      data-course-card
      className={`relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 hover:border-control-border motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
        isArchived ? "opacity-75 bg-card/60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <CourseThumb title={course.title} photoPath={course.photo_path} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            to={`/courses/${course.id}`}
            onClick={onNavigate}
            onKeyDown={(event) => { if (event.key === "Enter") onNavigate?.(); }}
            className="line-clamp-2 break-words text-base font-semibold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-2xl"
          >
            {course.title}
          </Link>
          <span className="truncate text-sm text-muted">{t(`examTypeLabel.${course.exam_type}`)}</span>
          {mentorName !== null && <span className="truncate text-sm text-muted">{mentorName}</span>}
        </div>
        {menu.items.length > 0 && <Menu items={menu.items} label={menu.label} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {groups.length > 0 ? (
          groups.map((group: ScheduleGroup) => (
            <span
              key={`${group.days.join("-")}-${group.timeStart}-${group.timeEnd}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-strip px-2.5 py-1 text-xs font-medium text-ink tabular-nums"
            >
              <Clock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span>
                {group.days.map((day: number): string => t(`weekdayShort.${day}`)).join(", ")}
                {" · "}
                {group.timeStart}–{group.timeEnd}
              </span>
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-strip px-2.5 py-1 text-xs font-medium text-muted">
            <Clock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span>{t("noSchedule")}</span>
          </span>
        )}

        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-strip px-2.5 py-1 text-xs font-medium text-ink tabular-nums">
          <CalendarDays className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span>
            {formatSchoolLessonDate(course.start_date, i18n.language)} – {formatSchoolLessonDate(course.end_date, i18n.language)}
          </span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-strip px-2.5 py-1 text-xs font-medium text-ink tabular-nums">
          <Users className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span>{t("studentsCount", { count: course.active_student_count })}</span>
        </span>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">
            {formatTjs(course.price, { perMonth: true, lng: i18n.language })}
          </span>
          <StatusBadge status={course.status === "active" ? "active" : "archived"} />
        </span>
        {isMentor && (
          <Link
            to={`/journals/${course.id}`}
            onClick={onNavigate}
            aria-label={`${t("openJournal")}: ${course.title}`}
            className="relative z-10 inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("openJournal")}
          </Link>
        )}
      </div>
    </div>
  );
}
