import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, MessageSquare, Minus, Pencil } from "lucide-react";
import { JournalCalculationDisclosure } from "./JournalCalculationDisclosure";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalSummaryEditor, type SummaryPairValues } from "./JournalSummaryEditor";
import { formatNumber, formatPercentage, formatSchoolLessonDate, formatSchoolLessonWeekday } from "../../i18n/formatters";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalStudentBreakdownProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  examMaximum: number;
  periodLabel: string;
  summaryStatus: CellSaveStatus | undefined;
  profileHref: string | null;
  onApplyPair: ((studentId: number, values: SummaryPairValues & { version: number }) => void) | null;
  onBack: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}

export const JournalStudentBreakdown: React.FC<JournalStudentBreakdownProps> = ({
  student,
  lessonDates,
  examMaximum,
  periodLabel,
  summaryStatus,
  profileHref,
  onApplyPair,
  onBack,
  headingRef,
}) => {
  const { t } = useTranslation("journals");
  const location = useLocation();
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const summary = student.summary;
  const studentName: string = `${student.first_name} ${student.last_name}`;
  const entriesByDate = new Map(student.entries.map((entry) => [entry.lesson_date, entry]));
  const percentageText: string | null = summary
    ? formatPercentage(summary.percentage)
    : null;

  const components: Array<[string, string]> = summary
    ? [
        [t("summary.homework"), formatNumber(summary.homework_score)],
        [t("summary.attendance"), t("summary.attendanceOf", { count: summary.attendance_count, total: summary.total_lessons })],
        [t("table.exam"), t("summary.outOf", { value: formatNumber(summary.exam_score), max: formatNumber(examMaximum) })],
        [t("table.bonus"), formatNumber(summary.bonus_score)],
      ]
    : [];

  return (
    <section aria-labelledby="journal-breakdown-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-control-border bg-card px-3 text-sm font-semibold text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("breakdown.back")}
        </button>
        {profileHref && (
          <Link
            to={profileHref}
            state={{ fromJournal: `${location.pathname}${location.search}` }}
            className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-semibold text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("breakdown.viewProfile")}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <h2 id="journal-breakdown-heading" ref={headingRef} tabIndex={-1} className="break-words text-xl font-semibold text-ink focus:outline-none">
          {studentName}
        </h2>
        <p className="text-sm text-muted">{t("breakdown.period", { period: periodLabel })}</p>
      </div>

      {summary ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-baseline gap-2 tabular-nums">
              <span className="text-3xl font-semibold text-ink">{formatNumber(summary.sum_score)}</span>
              <span className="text-lg text-muted">{t("summary.ofMax", { max: formatNumber(summary.max_period_score) })}</span>
            </p>
            <p className="flex items-center gap-2 text-lg font-semibold tabular-nums text-ink">
              {percentageText}
              {summaryStatus && <JournalSaveMarker status={summaryStatus} className="relative" />}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            {components.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <JournalCalculationDisclosure summary={summary} examMaximum={examMaximum} />
          {onApplyPair && (
            <button
              type="button"
              data-summary-edit={student.student_id}
              onClick={() => setEditorOpen(true)}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-sm font-semibold text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t("summary.editExamBonus")}
            </button>
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">{t("summary.unavailable")}</p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-ink">{t("breakdown.lessons")}</h3>
        {lessonDates.length === 0 ? (
          <p className="text-sm text-muted">{t("breakdown.noLessons")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {lessonDates.map((date) => {
              const entry = entriesByDate.get(date);
              const hasComment: boolean = Boolean(entry?.comment && entry.comment.trim().length > 0);
              return (
                <li key={date} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatSchoolLessonWeekday(date)}, {formatSchoolLessonDate(date)}
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 text-muted">
                        {entry?.attendance ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
                        {entry?.attendance ? t("table.present") : t("table.absent")}
                      </span>
                      <span className="tabular-nums text-ink">{t("lesson.scoreValue", { value: entry && entry.score > 0 ? entry.score : "—" })}</span>
                    </span>
                  </div>
                  {hasComment && (
                    <p className="flex items-start gap-1.5 text-sm text-muted">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 fill-current text-maroon-text" aria-hidden="true" />
                      <span className="break-words">{entry?.comment}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editorOpen && summary && onApplyPair && (
        <JournalSummaryEditor
          studentName={studentName}
          bonusScore={summary.bonus_score}
          examScore={summary.exam_score}
          examMaximum={examMaximum}
          currentTotal={summary.sum_score}
          maximumTotal={summary.max_period_score}
          onApply={(values) => onApplyPair(student.student_id, { ...values, version: summary.version })}
          onClose={() => setEditorOpen(false)}
          returnFocusSelector={`[data-summary-edit="${student.student_id}"]`}
        />
      )}
    </section>
  );
};
