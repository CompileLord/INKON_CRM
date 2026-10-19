import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Pencil } from "lucide-react";
import { JournalStudentBreakdown } from "./JournalStudentBreakdown";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalSummaryEditor, type SummaryPairValues } from "./JournalSummaryEditor";
import { useDesktop } from "../shell/useDesktop";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalEmbeddedSummary, JournalStudentResponse } from "../../lib/journals/types";

type ApplyPair = (studentId: number, values: SummaryPairValues & { version: number }) => void;

interface JournalSummaryViewProps {
  students: JournalStudentResponse[];
  allStudents: JournalStudentResponse[];
  lessonDates: string[];
  examMaximum: number;
  periodLabel: string;
  summaryStatus: Map<number, CellSaveStatus>;
  onApplyPair: ApplyPair | null;
  profileHrefFor: (studentId: number) => string | null;
  openStudentId: number | null;
  onOpenStudent: (studentId: number | null) => void;
}

function percentageText(summary: JournalEmbeddedSummary): string {
  return formatPercentage(summary.percentage);
}

export const JournalSummaryView: React.FC<JournalSummaryViewProps> = ({
  students,
  allStudents,
  lessonDates,
  examMaximum,
  periodLabel,
  summaryStatus,
  onApplyPair,
  profileHrefFor,
  openStudentId,
  onOpenStudent,
}) => {
  const { t } = useTranslation("journals");
  const isDesktop: boolean = useDesktop();
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const initiatorRef = useRef<number | null>(null);
  const scrollRef = useRef<number>(0);
  const breakdownHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingRestoreRef = useRef<boolean>(false);
  const focusHeadingRef = useRef<boolean>(openStudentId !== null);

  const openedStudent: JournalStudentResponse | undefined =
    openStudentId === null ? undefined : allStudents.find((student) => student.student_id === openStudentId);
  const editing: JournalStudentResponse | undefined =
    editingStudentId === null ? undefined : allStudents.find((student) => student.student_id === editingStudentId);

  useEffect(() => {
    if (openedStudent) {
      if (!focusHeadingRef.current) return undefined;
      focusHeadingRef.current = false;
      breakdownHeadingRef.current?.focus({ preventScroll: true });
      const headingFrameId: number = requestAnimationFrame(() => breakdownHeadingRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(headingFrameId);
    }
    if (!pendingRestoreRef.current) return undefined;
    pendingRestoreRef.current = false;
    const frameId: number = requestAnimationFrame(() => {
      window.scrollTo({ top: scrollRef.current, behavior: "auto" });
      const initiator: HTMLElement | null = document.querySelector<HTMLElement>(`[data-summary-open="${initiatorRef.current}"]`);
      initiator?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [openedStudent]);

  const openBreakdown = (studentId: number): void => {
    initiatorRef.current = studentId;
    scrollRef.current = window.scrollY;
    pendingRestoreRef.current = false;
    focusHeadingRef.current = true;
    onOpenStudent(studentId);
  };

  const closeBreakdown = (): void => {
    pendingRestoreRef.current = true;
    onOpenStudent(null);
  };

  if (openedStudent) {
    return (
      <JournalStudentBreakdown
        key={openedStudent.student_id}
        student={openedStudent}
        lessonDates={lessonDates}
        examMaximum={examMaximum}
        periodLabel={periodLabel}
        summaryStatus={summaryStatus.get(openedStudent.student_id)}
        profileHref={profileHrefFor(openedStudent.student_id)}
        onApplyPair={onApplyPair}
        onBack={closeBreakdown}
        headingRef={breakdownHeadingRef}
      />
    );
  }

  const editAction = (student: JournalStudentResponse) =>
    onApplyPair && student.summary ? (
      <button
        type="button"
        data-summary-edit={student.student_id}
        onClick={() => setEditingStudentId(student.student_id)}
        aria-label={t("summary.editExamBonusFor", { name: `${student.first_name} ${student.last_name}` })}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-maroon-text hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
        <span>{t("summary.edit")}</span>
      </button>
    ) : null;

  const nameButton = (student: JournalStudentResponse, withChevron: boolean) => (
    <button
      type="button"
      data-summary-open={student.student_id}
      onClick={() => openBreakdown(student.student_id)}
      aria-label={t("summary.openBreakdown", { name: `${student.first_name} ${student.last_name}` })}
      className="group inline-flex min-h-11 min-w-0 items-center gap-1 rounded-[10px] px-1 text-left text-base font-semibold text-ink underline-offset-4 hover:text-maroon-text hover:underline focus-visible:text-maroon-text focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 break-words">
        {student.first_name} {student.last_name}
      </span>
      {withChevron && <ChevronRight className="h-4 w-4 shrink-0 text-maroon-text" aria-hidden="true" />}
    </button>
  );

  const editor = editing && editing.summary && onApplyPair && (
    <JournalSummaryEditor
      studentName={`${editing.first_name} ${editing.last_name}`}
      bonusScore={editing.summary.bonus_score}
      examScore={editing.summary.exam_score}
      examMaximum={examMaximum}
      currentTotal={editing.summary.sum_score}
      maximumTotal={editing.summary.max_period_score}
      onApply={(values) => onApplyPair(editing.student_id, { ...values, version: (editing.summary as JournalEmbeddedSummary).version })}
      onClose={() => setEditingStudentId(null)}
      returnFocusSelector={`[data-summary-edit="${editing.student_id}"]`}
    />
  );

  const listing = isDesktop ? (
      <div className="relative w-full min-w-0 max-w-full overflow-x-auto rounded-2xl border border-border bg-card">
        <table aria-label={t("summary.listLabel", { period: periodLabel })} className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr className="bg-beige text-left text-ink">
              <th scope="col" className="px-4 py-3 font-semibold">{t("table.students")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">{t("summary.homework")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">{t("summary.attendance")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">{t("table.exam")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">{t("table.bonus")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">{t("summary.totalMax")}</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold">%</th>
              <th scope="col" className="px-2 py-3 text-right font-semibold"><span className="sr-only">{t("summary.actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const summary = student.summary;
              return (
                <tr key={student.student_id} className="border-t border-border align-middle hover:bg-row-hover">
                  <th scope="row" className="px-4 py-2 text-left">{nameButton(student, false)}</th>
                  {summary ? (
                    <>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatNumber(summary.homework_score)}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{t("summary.attendanceOf", { count: summary.attendance_count, total: summary.total_lessons })}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{t("summary.outOf", { value: formatNumber(summary.exam_score), max: formatNumber(examMaximum) })}</td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatNumber(summary.bonus_score)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-ink">
                        <span className="inline-flex items-center gap-2">
                          {summaryStatus.get(student.student_id) && <JournalSaveMarker status={summaryStatus.get(student.student_id) as CellSaveStatus} className="relative" />}
                          {formatNumber(summary.sum_score)} / {formatNumber(summary.max_period_score)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-muted">{percentageText(summary)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-right text-muted">—</td>
                      <td className="px-2 py-2 text-right text-muted">—</td>
                      <td className="px-2 py-2 text-right text-muted">—</td>
                      <td className="px-2 py-2 text-right text-muted">—</td>
                      <td colSpan={2} className="px-2 py-2 text-right text-muted">{t("summary.unavailable")}</td>
                    </>
                  )}
                  <td className="px-2 py-2 text-right">{editAction(student)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  ) : (
      <ul aria-label={t("summary.listLabel", { period: periodLabel })} className="divide-y divide-border rounded-2xl border border-border bg-card">
        {students.map((student) => {
          const summary = student.summary;
          return (
            <li key={student.student_id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                {nameButton(student, true)}
                {summary ? (
                  <span className="flex shrink-0 flex-col items-end tabular-nums">
                    <span className="flex items-center gap-2 text-lg font-semibold text-ink">
                      {summaryStatus.get(student.student_id) && <JournalSaveMarker status={summaryStatus.get(student.student_id) as CellSaveStatus} className="relative" />}
                      {formatNumber(summary.sum_score)} / {formatNumber(summary.max_period_score)}
                    </span>
                    <span className="text-sm text-muted">{percentageText(summary)}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-muted">{t("summary.unavailable")}</span>
                )}
              </div>
              {summary && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-muted">{t("summary.homework")}</dt><dd className="tabular-nums">{formatNumber(summary.homework_score)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{t("summary.attendance")}</dt><dd className="tabular-nums">{t("summary.attendanceOf", { count: summary.attendance_count, total: summary.total_lessons })}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{t("table.exam")}</dt><dd className="tabular-nums">{t("summary.outOf", { value: formatNumber(summary.exam_score), max: formatNumber(examMaximum) })}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted">{t("table.bonus")}</dt><dd className="tabular-nums">{formatNumber(summary.bonus_score)}</dd></div>
                </dl>
              )}
              <div className="flex justify-end">{editAction(student)}</div>
            </li>
          );
        })}
      </ul>
  );

  return (
    <>
      {listing}
      {editor}
    </>
  );
};
