import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { InitialTile } from "../ui/InitialTile";
import { ListRow } from "../ui/ListRow";
import { formatDate } from "../../i18n/formatters";
import { formatTjs } from "../../lib/money";
import type { CourseResponse } from "../../lib/courses/types";

export function MentorCourses({ courses }: { courses: CourseResponse[] }) {
  const { t } = useTranslation("mentorProfile");
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
          <ListRow to={`/courses/${course.id}`}>
            <span className="flex min-w-0 items-center gap-3">
              <InitialTile name={course.title} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{course.title}</span>
                  <Badge status={course.status} />
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {formatDate(course.start_date)} – {formatDate(course.end_date)} · {formatTjs(course.price, { perMonth: true })}
                </span>
              </span>
            </span>
          </ListRow>
        </li>
      ))}
    </ul>
  );
}
