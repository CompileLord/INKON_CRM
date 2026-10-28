import { useTranslation } from "react-i18next";
import { formatTjs } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { StatusBadge } from "../ui/Badge";
import { ListRow } from "../ui/ListRow";
import { courseLifecycleStatus } from "./courseLifecycleStatus";
import { CourseScheduleLine } from "./CourseScheduleLine";
import { CourseThumb } from "./CourseThumb";
import { useCourseMenu, type CourseMenuHandlers } from "./useCourseMenu";
import type { CourseListItemResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseListRowProps {
  course: CourseListItemResponse;
  mentor?: User;
  showMentor: boolean;
  isMentor: boolean;
  menuHandlers: CourseMenuHandlers | null;
  onNavigate?: () => void;
}

export function CourseListRow({ course, mentor, showMentor, isMentor, menuHandlers, onNavigate }: CourseListRowProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const menu = useCourseMenu(course, menuHandlers, isMentor ? () => onNavigate?.() : null);
  const mentorName: string | null = mentor ? `${mentor.first_name} ${mentor.last_name}`.trim() : null;
  const columns: string = showMentor
    ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_7.5rem]"
    : "md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem]";

  return (
    <div ref={menu.rootRef} onClickCapture={onNavigate === undefined ? undefined : (event) => { if ((event.target as HTMLElement).closest("a") !== null) onNavigate(); }}>
      <ListRow to={`/courses/${course.id}`} menuItems={menu.items} menuLabel={menu.label}>
        <span className={`grid items-center gap-x-4 gap-y-1 ${columns}`}>
          <span className="flex min-w-0 items-center gap-3">
            <CourseThumb title={course.title} photoPath={course.photo_path} size="md" />
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                <span className="break-words text-sm font-semibold text-ink">{course.title}</span>
                <StatusBadge status={courseLifecycleStatus(course)} />
              </span>
            </span>
          </span>
          {showMentor && <span className="break-words text-sm text-muted">{mentorName ?? ""}</span>}
          <span className="flex min-w-0 flex-col gap-0.5">
            <CourseScheduleLine schedules={course.schedules} />
            <span className="flex flex-wrap gap-x-1.5 text-sm text-muted tabular-nums">
              <span>{formatSchoolLessonDate(course.start_date, i18n.language)} – {formatSchoolLessonDate(course.end_date, i18n.language)}</span>
              <span aria-hidden="true">·</span>
              <span>{t("studentsCount", { count: course.active_student_count })}</span>
            </span>
          </span>
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink md:text-right">
            {formatTjs(course.price, { perMonth: true, lng: i18n.language })}
          </span>
        </span>
      </ListRow>
    </div>
  );
}
