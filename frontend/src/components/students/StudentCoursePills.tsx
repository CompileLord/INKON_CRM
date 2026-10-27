import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";
import type { StudentCoursePillResponse } from "../../lib/users/types";

const VISIBLE_PILL_COUNT = 2;

interface StudentCoursePillsProps {
  courses: readonly StudentCoursePillResponse[];
}

export function StudentCoursePills({ courses }: StudentCoursePillsProps) {
  const { t, i18n } = useTranslation("students");
  if (courses.length === 0) return <span className="hidden text-sm text-muted md:block">—</span>;
  const visible: readonly StudentCoursePillResponse[] = courses.slice(0, VISIBLE_PILL_COUNT);
  const hidden: readonly StudentCoursePillResponse[] = courses.slice(VISIBLE_PILL_COUNT);

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {visible.map((course) => (
        <span key={course.enrollment_id} title={course.title} className="max-w-full truncate rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium text-ink">
          {course.title}
        </span>
      ))}
      {hidden.length > 0 && (
        <span title={hidden.map((course) => course.title).join(", ")} className="rounded-full bg-strip px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">
          {t("table.coursesMore", { count: formatNumber(hidden.length, i18n.language) })}
        </span>
      )}
    </span>
  );
}
