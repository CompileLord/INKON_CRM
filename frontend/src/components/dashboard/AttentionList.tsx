import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDashboardAttention } from "../../lib/dashboard/hooks";
import type { AttentionAbsentStudent, AttentionLesson, DashboardAttention } from "../../lib/dashboard/types";
import { FinanceUrlState } from "../../lib/finance/urlState";
import { formatMoney } from "../../lib/money";
import { formatTime, getSchoolCalendarDate } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";
import { StaleNotice } from "./StaleNotice";
import { useNextLessonText } from "./useNextLessonText";

export const CONSECUTIVE_ABSENCE_BADGE_THRESHOLD: number = 3;

export interface PaymentRequest {
  studentId: number;
  studentName: string;
  courseId: number;
  courseName: string;
}

interface AttentionListProps {
  onPay: (request: PaymentRequest) => void;
}

const LINK_CLASSES: string = "inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function AttentionSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2].map((group) => (
        <div key={group} className="flex flex-col gap-2 motion-safe:animate-pulse">
          <div className="h-3 w-32 rounded bg-border" />
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 py-2">
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-40 max-w-full rounded bg-border" />
                <div className="h-3 w-28 max-w-full rounded bg-border" />
              </div>
              <div className="h-4 w-20 rounded bg-border" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AttentionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </section>
  );
}

function LessonTitle({ lesson }: { lesson: AttentionLesson }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
        {formatTime(lesson.time_start)}–{formatTime(lesson.time_end)}
      </span>
      <span className="break-words text-sm font-medium text-ink">{lesson.course_title}</span>
    </span>
  );
}

function absenceBadge(student: AttentionAbsentStudent, label: string): ReactNode {
  if (student.consecutive_absences < CONSECUTIVE_ABSENCE_BADGE_THRESHOLD) return null;
  return <span data-absence-badge className="rounded-full border border-warning/40 px-2 py-0.5 text-xs font-medium text-warning">{label}</span>;
}

function overdueDaysOf(dueDate: string, today: string): number {
  const millisecondsPerDay: number = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / millisecondsPerDay));
}

function isAllClear(attention: DashboardAttention): boolean {
  return (
    attention.lessons_in_progress.length === 0 &&
    attention.attendance_not_marked.length === 0 &&
    attention.absent_students.length === 0 &&
    attention.payments.length === 0
  );
}

function AttentionGroups({ attention, onPay }: { attention: DashboardAttention; onPay: (request: PaymentRequest) => void }) {
  const { t } = useTranslation("dashboard");
  const today: string = getSchoolCalendarDate(new Date());
  return (
    <div className="flex flex-col gap-4">
      {attention.lessons_in_progress.length > 0 && (
        <AttentionGroup title={t("attentionLessonsInProgress")}>
          {attention.lessons_in_progress.map((lesson) => (
            <li key={`${lesson.course_id}-${lesson.time_start}`} className="flex min-w-0 flex-col gap-0.5 py-2">
              <LessonTitle lesson={lesson} />
              <span className="break-words text-sm text-muted">{lesson.mentor_name}</span>
            </li>
          ))}
        </AttentionGroup>
      )}
      {attention.attendance_not_marked.length > 0 && (
        <AttentionGroup title={t("attentionAttendanceNotMarked")}>
          {attention.attendance_not_marked.map((lesson) => (
            <li key={`${lesson.course_id}-${lesson.time_start}`} className="flex min-w-0 items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <LessonTitle lesson={lesson} />
                <span className="break-words text-sm text-muted">
                  {lesson.mentor_name}
                  {lesson.mentor_phone !== null && (
                    <>
                      {" · "}
                      <a href={`tel:${lesson.mentor_phone}`} className="tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{lesson.mentor_phone}</a>
                    </>
                  )}
                </span>
              </span>
              {lesson.journal_id !== null && (
                <Link to={`/journals/${lesson.journal_id}`} className={`${LINK_CLASSES} shrink-0`}>{t("openJournal")}</Link>
              )}
            </li>
          ))}
        </AttentionGroup>
      )}
      {attention.absent_students.length > 0 && (
        <AttentionGroup title={t("attentionAbsentStudents")}>
          {attention.absent_students.map((lesson) => (
            <li key={`${lesson.course_id}-${lesson.time_start}`} className="flex min-w-0 flex-col gap-1 py-2">
              <LessonTitle lesson={lesson} />
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {lesson.students.map((student) => (
                  <li key={student.student_id} className="flex items-center gap-2">
                    <Link to={`/students/${student.student_id}`} className="inline-flex min-h-11 items-center break-words text-sm text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {student.student_name}
                    </Link>
                    {absenceBadge(student, t("absenceStreak", { count: student.consecutive_absences, ordinal: true }))}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </AttentionGroup>
      )}
      {attention.payments.length > 0 && (
        <AttentionGroup title={t("attentionPayments")}>
          {attention.payments.map((payment) => {
            const overdueDays: number = overdueDaysOf(payment.due_date, today);
            return (
              <li key={payment.enrollment_id} className="flex min-w-0 items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <Link to={`/students/${payment.student_id}`} className="break-words text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {payment.student_name}
                  </Link>
                  <span className="break-words text-sm text-muted">
                    {payment.course_title} · <span className="tabular-nums">{overdueDays > 0 ? t("overdueDays", { count: overdueDays }) : t("dueToday")}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm font-semibold tabular-nums ${overdueDays > 0 ? "text-destructive" : "text-ink"}`}>
                    {formatMoney(payment.remaining_amount, { suffix: "TJS" })}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onPay({ studentId: payment.student_id, studentName: payment.student_name, courseId: payment.course_id, courseName: payment.course_title })}
                  >
                    {t("payAction")}
                  </Button>
                </span>
              </li>
            );
          })}
        </AttentionGroup>
      )}
    </div>
  );
}

export function AttentionList({ onPay }: AttentionListProps) {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useDashboardAttention();
  const nextLessonText: string | null = useNextLessonText();

  return (
    <SectionCard
      title={t("attentionToday")}
      actions={<Link to={FinanceUrlState.debtorsLocation()} className={LINK_CLASSES}>{t("openFinanceViewDebts")}</Link>}
    >
      {data === undefined && isLoading ? (
        <AttentionSkeleton />
      ) : data === undefined ? (
        <ErrorState message={t("errorLoadingAttention")} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          {isError && <StaleNotice onRetry={() => refetch()} />}
          {isAllClear(data) ? (
            <EmptyState title={t("attentionAllClear")} description={nextLessonText === null ? undefined : t("nextLesson", { when: nextLessonText })} />
          ) : (
            <AttentionGroups attention={data} onPay={onPay} />
          )}
        </div>
      )}
    </SectionCard>
  );
}
