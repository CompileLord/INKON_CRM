import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMyStudentJournalHistory } from "../../lib/users/hooks";
import { StudentPeriodOrdering } from "../../lib/students/StudentPeriodOrdering";
import type { StudentCourseProfile, StudentJournalPeriod } from "../../lib/users/types";
import { formatNumber, formatSchoolPeriodSpan } from "../../i18n/formatters";
import { EmptyState } from "../ui/EmptyState";

interface StudentDashboardCoursesProps {
  activeCourses: StudentCourseProfile[];
  isLoading: boolean;
}

const SKELETON_ROW_COUNT: number = 2;

function skeletonRows() {
  return Array.from({ length: SKELETON_ROW_COUNT }, (_: unknown, index: number) => (
    <li key={index} className="flex items-center justify-between gap-3 p-4 motion-safe:animate-pulse">
      <span className="h-5 w-40 max-w-full rounded bg-strip" />
      <span className="h-5 w-16 rounded bg-strip" />
    </li>
  ));
}

export function StudentDashboardCourses({ activeCourses, isLoading }: StudentDashboardCoursesProps) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const history = useMyStudentJournalHistory(undefined, activeCourses.length > 0);
  const periods: StudentJournalPeriod[] = StudentPeriodOrdering.available(history.data?.pages.flatMap((page) => page.items) ?? []).filter((period: StudentJournalPeriod) => period.state === "graded");

  if (isLoading) {
    return (
      <ul role="status" aria-busy="true" data-testid="student-courses-skeleton" className="divide-y divide-border rounded-2xl border border-border bg-card">
        <span className="sr-only">{t("common:loading")}</span>
        {skeletonRows()}
      </ul>
    );
  }
  if (activeCourses.length === 0) return <EmptyState title={t("student:noCoursesTitle")} description={t("student:noCoursesBody")} />;

  return (
    <ul aria-label={t("student:activeSegment")} data-testid="student-latest-totals" className="divide-y divide-border rounded-2xl border border-border bg-card">
      {activeCourses.map((entry: StudentCourseProfile) => {
        const latest: StudentJournalPeriod | undefined = periods.find((period: StudentJournalPeriod) => period.course_id === entry.course.id);
        return (
          <li key={entry.course.id} data-testid="student-home-course" className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="break-words text-sm font-medium text-ink">{entry.course.title}</span>
              {latest !== undefined && <span className="text-xs text-muted tabular-nums">{formatSchoolPeriodSpan(latest.period_start, latest.period_end, i18n.language)}</span>}
            </span>
            {history.isLoading ? (
              <span className="h-5 w-10 rounded bg-strip motion-safe:animate-pulse" aria-hidden="true" />
            ) : history.isError ? (
              <span className="text-xs text-muted">{t("student:scoreUnavailable")}</span>
            ) : latest !== undefined ? (
              <span data-testid="latest-total" className="text-base font-semibold text-ink tabular-nums">{formatNumber(latest.sum_score, i18n.language)}</span>
            ) : (
              <span className="text-xs text-muted">{t("student:notGradedYet")}</span>
            )}
            <Link
              to={`/my/courses/${entry.course.id}/journal`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3 text-sm font-semibold text-maroon-text hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
            >
              {t("student:home.continue")}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
