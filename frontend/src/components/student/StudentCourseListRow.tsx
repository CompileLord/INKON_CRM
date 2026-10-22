import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { ListRow } from "../ui/ListRow";
import { CourseThumb } from "./CourseThumb";
import { CourseScore } from "./CourseScore";

interface StudentCourseListRowProps {
  entry: StudentCourseProfile;
}

export function StudentCourseListRow({ entry }: StudentCourseListRowProps) {
  const { t } = useTranslation("student");
  const { course } = entry;
  const hasScore: boolean = entry.my_total_score !== undefined && entry.my_total_max_score !== undefined && entry.my_total_max_score > 0;
  const statusLabel: string | null =
    entry.enrollment_status === "completed" ? t("status.completed") : entry.enrollment_status === "withdrawn" ? t("status.left") : null;

  return (
    <ListRow to={`/my/courses/${course.id}`}>
      <div className="flex items-center gap-3">
        <CourseThumb title={course.title} photoPath={course.photo_path} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="break-words text-sm font-medium text-ink">{course.title}</span>
          <span className="text-sm tabular-nums text-muted">
            {formatSchoolLessonDate(course.start_date)} – {formatSchoolLessonDate(course.end_date)}
            {statusLabel !== null && <span data-testid="course-status-chip"> · {statusLabel}</span>}
          </span>
        </div>
        <div className="shrink-0 text-right text-sm" data-testid="course-score">
          {hasScore ? (
            <CourseScore score={entry.my_total_score!} />
          ) : (
            <span className="text-xs text-muted">{t("notGradedYet")}</span>
          )}
        </div>
      </div>
    </ListRow>
  );
}
