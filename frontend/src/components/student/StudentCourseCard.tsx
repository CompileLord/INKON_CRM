import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GrantBadge } from "../enrollments/GrantBadge";
import { CourseScore } from "./CourseScore";
import { CourseScheduleLine } from "../courses/CourseScheduleLine";
import { StudentCourseEntry } from "./StudentCourseEntry";
import { StudentCourseStagePill } from "./StudentCourseStagePill";
import { formatDate } from "../../i18n/formatters";
import { formatTjs, isPositiveMoney } from "../../lib/money";
import { buildCourseJournalUrl } from "../../lib/courses/returnContext";
import { getStudentCourseLink } from "../../lib/students/studentNavigation";
import type { StudentCourseBalance } from "../../lib/students/useStudentCourseBalances";
import type { CourseScheduleResponse } from "../../lib/courses/types";
import type { StudentCourseProfile } from "../../lib/users/types";

interface StudentCourseCardProps {
  item: StudentCourseProfile;
  role: string | null;
  currentUserId: number | null;
  mentorName: string | null;
  schedules: CourseScheduleResponse[];
  balance: StudentCourseBalance | undefined;
}

function journalPath(courseId: number, role: string | null): string {
  return role === "student" ? `/my/courses/${courseId}/journal` : buildCourseJournalUrl(courseId);
}

export function StudentCourseCard({ item, role, currentUserId, mentorName, schedules, balance }: StudentCourseCardProps) {
  const { t, i18n } = useTranslation("studentProfile");
  const linkInfo = getStudentCourseLink(item.course.id, item.course.mentor_id, role, currentUserId);
  const canOpenJournal: boolean = role === "superadmin" || role === "student" || (role === "mentor" && item.course.mentor_id === currentUserId);
  const hasDebt: boolean = balance !== undefined && !balance.isGrant && isPositiveMoney(balance.openDebt);

  return (
    <li data-testid="student-course-card" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1 basis-64">
        <StudentCourseEntry to={linkInfo.to} isNavigable={linkInfo.isNavigable}>
          <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{item.course.title}</span>
                <StudentCourseStagePill course={item} />
              </span>
              {mentorName !== null && <span data-testid="course-mentor" className="text-xs text-muted">{mentorName}</span>}
              {schedules.length > 0 && <span data-testid="course-schedule" className="text-xs text-muted"><CourseScheduleLine schedules={schedules} /></span>}
              <span className="text-xs tabular-nums text-muted">{formatDate(item.course.start_date, i18n.language)} – {formatDate(item.course.end_date, i18n.language)}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-right text-sm">
              {typeof item.my_total_score === "number" && (item.my_total_max_score ?? 0) > 0 ? <CourseScore score={item.my_total_score} /> : <span className="text-muted">—</span>}
              {item.periods_total > 0 ? (
                <span className="text-xs tabular-nums text-muted">{t("courses.periodsGraded", { graded: item.periods_graded, total: item.periods_total })}</span>
              ) : null}
              {balance?.isGrant ? <GrantBadge billingMode="grant" /> : null}
              {hasDebt && balance !== undefined ? <span data-testid="course-debt" className="text-xs font-medium tabular-nums text-destructive">{t("courses.debt", { amount: formatTjs(balance.openDebt, { lng: i18n.language }) })}</span> : null}
            </span>
          </span>
        </StudentCourseEntry>
      </div>
      {canOpenJournal && (
        <Link to={journalPath(item.course.id, role)} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out">
          {t("courses.openJournal")}
        </Link>
      )}
    </li>
  );
}
