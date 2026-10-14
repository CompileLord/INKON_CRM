import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CourseResponse } from "../../lib/courses/types";
import { formatDate } from "../../i18n/formatters";
import { formatMoney } from "../../lib/money";

export function MentorCourses({ courses }: { courses: CourseResponse[] }) {
  const { t, i18n } = useTranslation("mentors");
  if (courses.length === 0) return <div className="rounded-2xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
    <p className="font-semibold text-ink">{t("noActiveCourses")}</p><p className="mt-1 text-xs">{t("profile.noCoursesHelp")}</p>
  </div>;
  return <div className="flex min-w-0 flex-col gap-3">{courses.map(course => <div key={course.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border-warm bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <Link to={`/courses/${course.id}`} className="inline-flex min-h-11 min-w-0 items-center text-base font-semibold text-ink hover:underline [overflow-wrap:anywhere]">{course.title}</Link>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${course.status === "active" ? "bg-success-surface text-success" : "bg-beige text-muted"}`}>{t(`profile.courseStatus.${course.status}`)}</span>
    </div>
    <div className="flex flex-col gap-1 text-xs text-muted sm:flex-row sm:justify-between">
      <span>{formatDate(course.start_date, i18n.language)} – {formatDate(course.end_date, i18n.language)}</span>
      <span className="font-semibold text-ink tabular-nums">{formatMoney(course.price, { suffix: t("profile.currencyTjs") })}</span>
    </div>
  </div>)}</div>;
}
