import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatTjs } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { Badge } from "../ui/Badge";
import { Menu } from "../ui/Menu";
import { CourseScheduleLine } from "./CourseScheduleLine";
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

export function CourseCard({ course, mentor, isMentor, menuHandlers, onNavigate }: CourseCardProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const menu = useCourseMenu(course, menuHandlers);
  const mentorName: string | null = mentor ? `${mentor.first_name} ${mentor.last_name}`.trim() : null;

  return (
    <div ref={menu.rootRef} data-course-card className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out">
      <div className="flex items-start gap-3">
        <CourseThumb title={course.title} photoPath={course.photo_path} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            to={`/courses/${course.id}`}
            onClick={onNavigate}
            onKeyDown={(event) => { if (event.key === "Enter") onNavigate?.(); }}
            className="break-words text-base font-semibold text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-2xl"
          >
            {course.title}
          </Link>
          <span className="flex min-w-0 flex-wrap gap-x-1.5 text-sm text-muted">
            <span>{t(`examTypeLabel.${course.exam_type}`)}</span>
            {mentorName !== null && <span aria-hidden="true">·</span>}
            {mentorName !== null && <span className="break-words">{mentorName}</span>}
          </span>
        </div>
        {course.status === "archived" && <Badge status="archived" />}
        {menu.items.length > 0 && <Menu items={menu.items} label={menu.label} />}
      </div>

      <div className="flex flex-col gap-1">
        <CourseScheduleLine schedules={course.schedules} />
        <span className="text-sm text-muted tabular-nums">
          {formatSchoolLessonDate(course.start_date, i18n.language)} – {formatSchoolLessonDate(course.end_date, i18n.language)}
        </span>
        <span className="text-sm text-muted tabular-nums">{t("studentsCount", { count: course.active_student_count })}</span>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">
          {formatTjs(course.price, { perMonth: true, lng: i18n.language })}
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
