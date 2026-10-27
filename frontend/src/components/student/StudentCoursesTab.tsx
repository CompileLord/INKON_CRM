import { useTranslation } from "react-i18next";
import { EmptyState } from "../ui/EmptyState";
import { GrantBadge } from "../enrollments/GrantBadge";
import { useStudentBillingModes } from "../../lib/enrollments/hooks";
import { CourseScore } from "./CourseScore";
import { StudentCourseEntry } from "./StudentCourseEntry";
import { StudentCourseStagePill } from "./StudentCourseStagePill";
import { formatDate } from "../../i18n/formatters";
import { formatMoney } from "../../lib/money";
import { getStudentCourseLink } from "../../lib/students/studentNavigation";
import type { StudentCourseProfile } from "../../lib/users/types";

interface StudentCoursesTabProps {
  courses: StudentCourseProfile[];
  studentId: number;
  role: string | null;
  currentUserId: number | null;
}

export function StudentCoursesTab({ courses, studentId, role, currentUserId }: StudentCoursesTabProps) {
  const { t, i18n } = useTranslation("studentProfile");
  const billingModes = useStudentBillingModes(role === "superadmin" ? studentId : undefined);

  if (courses.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card">
        <EmptyState title={t("courses.emptyTitle")} description={t(role === "student" ? "courses.emptyStudent" : "courses.empty")} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <ul className="flex flex-col divide-y divide-border">
        {courses.map((item: StudentCourseProfile) => {
          const linkInfo = getStudentCourseLink(item.course.id, item.course.mentor_id, role, currentUserId);
          return (
            <li key={item.course.id}>
              <StudentCourseEntry to={linkInfo.to} isNavigable={linkInfo.isNavigable}>
                <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{item.course.title}</span>
                      <StudentCourseStagePill course={item} />
                      <GrantBadge billingMode={billingModes.data?.get(item.course.id)} />
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {formatDate(item.course.start_date, i18n.language)} – {formatDate(item.course.end_date, i18n.language)} · {formatMoney(item.course.price, { suffix: t("stats.currency") })}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-right text-sm">
                    {typeof item.my_total_score === "number" && (item.my_total_max_score ?? 0) > 0 ? <CourseScore score={item.my_total_score} /> : <span className="text-muted">—</span>}
                    {item.periods_total > 0 ? (
                      <span className="text-xs tabular-nums text-muted">{t("courses.periodsGraded", { graded: item.periods_graded, total: item.periods_total })}</span>
                    ) : null}
                  </span>
                </span>
              </StudentCourseEntry>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
