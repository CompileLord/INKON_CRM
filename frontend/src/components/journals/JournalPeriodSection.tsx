import { Fragment, useMemo, useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { PersonAvatar } from "../ui/PersonAvatar";
import { AuthApiError } from "../../lib/auth/errors";
import { useBatchUpdateJournalEntries, useJournal, useUpdateJournalStudentSummary } from "../../lib/journals/hooks";
import { entryKey } from "../../lib/journals/types";
import { formatDate } from "../../i18n/formatters";
import type { JournalPeriod } from "../../lib/courses/types";
import type { JournalEntryResponse, JournalEntryUpdate } from "../../lib/journals/types";

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5];

interface JournalPeriodSectionProps {
  courseId: number;
  period: JournalPeriod;
  periodIndex: number;
  expanded: boolean;
  onToggle: () => void;
  onToast: (message: string, variant?: "success" | "error") => void;
}

function sumBadgeClass(sum: number): string {
  if (sum >= 90) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300";
  if (sum >= 75) return "bg-lime-100 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300";
  if (sum >= 60) return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300";
}

function blankEntry(studentId: number, lessonDate: string): JournalEntryUpdate {
  return { student_id: studentId, lesson_date: lessonDate, attendance: false, score: 0, comment: null, version: 0 };
}

function toUpdate(studentId: number, entry: JournalEntryResponse): JournalEntryUpdate {
  return {
    student_id: studentId,
    lesson_date: entry.lesson_date,
    attendance: entry.attendance,
    score: entry.score,
    comment: entry.comment,
    version: entry.version,
  };
}

export function JournalPeriodSection({ courseId, period, periodIndex, expanded, onToggle, onToast }: JournalPeriodSectionProps) {
  const { t, i18n } = useTranslation(["journals", "common"]);
  const { data: detail, isLoading, isError, refetch } = useJournal(expanded ? period.id : undefined);
  const batchUpdate = useBatchUpdateJournalEntries(period.id, courseId);
  const updateSummary = useUpdateJournalStudentSummary(period.id, courseId);
  const [savingSummaryFor, setSavingSummaryFor] = useState<number | null>(null);

  const [pending, setPending] = useState<Map<string, JournalEntryUpdate>>(new Map());
  const [commentTarget, setCommentTarget] = useState<{ studentId: number; lessonDate: string } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [summaryDrafts, setSummaryDrafts] = useState<Map<number, { exam_score: number; bonus_score: number }>>(
    new Map(),
  );

  const periodLabel =
    period.period_type === "week"
      ? t("period.week", { n: periodIndex })
      : t("period.month", { n: periodIndex });

  const endOfLabel = period.period_type === "week" ? t("table.endOfWeek") : t("table.endOfMonth");

  const originalByKey = useMemo(() => {
    const map = new Map<string, JournalEntryResponse>();
    if (!detail) return map;
    for (const student of detail.students) {
      for (const entry of student.entries) {
        map.set(entryKey(student.student_id, entry.lesson_date), entry);
      }
    }
    return map;
  }, [detail]);

  const cellFor = (studentId: number, lessonDate: string): JournalEntryUpdate => {
    const key = entryKey(studentId, lessonDate);
    const pendingEntry = pending.get(key);
    if (pendingEntry) return pendingEntry;
    const original = originalByKey.get(key);
    return original ? toUpdate(studentId, original) : blankEntry(studentId, lessonDate);
  };

  const hasComment = (studentId: number, lessonDate: string): boolean => {
    const cell = cellFor(studentId, lessonDate);
    return Boolean(cell.comment && cell.comment.trim().length > 0);
  };

  const updateCell = (studentId: number, lessonDate: string, patch: Partial<JournalEntryUpdate>) => {
    const key = entryKey(studentId, lessonDate);
    const current = cellFor(studentId, lessonDate);
    setPending((prev) => new Map(prev).set(key, { ...current, ...patch }));
  };

  const openCommentEditor = (studentId: number, lessonDate: string) => {
    setCommentTarget({ studentId, lessonDate });
    setCommentDraft(cellFor(studentId, lessonDate).comment ?? "");
  };

  const saveComment = () => {
    if (!commentTarget) return;
    updateCell(commentTarget.studentId, commentTarget.lessonDate, {
      comment: commentDraft.trim().length > 0 ? commentDraft : null,
    });
    setCommentTarget(null);
  };

  const handleSaveEntries = async () => {
    if (pending.size === 0) return;
    try {
      await batchUpdate.mutateAsync([...pending.values()]);
      setPending(new Map());
      onToast(t("entriesSaved"));
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 409) await refetch();
      onToast(err instanceof AuthApiError ? err.message : t("entriesSaveFailed"), "error");
    }
  };

  const draftFor = (studentId: number, exam: number, bonus: number) =>
    summaryDrafts.get(studentId) ?? { exam_score: exam, bonus_score: bonus };

  const setSummaryDraft = (studentId: number, exam: number, bonus: number, patch: Partial<{ exam_score: number; bonus_score: number }>) => {
    const current = draftFor(studentId, exam, bonus);
    setSummaryDrafts((prev) => new Map(prev).set(studentId, { ...current, ...patch }));
  };

  const handleSaveSummary = (studentId: number, examScore: number, bonusScore: number, version: number) => {
    setSavingSummaryFor(studentId);
    updateSummary.mutate(
      { studentId, payload: { exam_score: examScore, bonus_score: bonusScore, version } },
      {
        onSuccess: () => {
          setSummaryDrafts((prev) => {
            const next = new Map(prev);
            next.delete(studentId);
            return next;
          });
          onToast(t("summarySaved"));
        },
        onError: (err) => {
          if (err instanceof AuthApiError && err.status === 409) refetch();
          onToast(err instanceof AuthApiError ? err.message : t("summarySaveFailed"), "error");
        },
        onSettled: () => setSavingSummaryFor(null),
      },
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <h3 className="text-[15px] font-semibold text-ink">{periodLabel}</h3>
        <ChevronDown size={18} className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border-warm">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted">{t("loading")}</div>
          ) : isError || !detail ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-muted">{t("loadFailed")}</p>
              <Button type="button" variant="secondary" onClick={() => refetch()}>
                {t("common:retry")}
              </Button>
            </div>
          ) : detail.students.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">{t("table.noStudentsInCourse")}</div>
          ) : (
            <>
              <div className="flex justify-end px-5 pt-3.5">
                <Button
                  type="button"
                  variant="accent"
                  loading={batchUpdate.isPending}
                  disabled={pending.size === 0}
                  onClick={handleSaveEntries}
                >
                  {t("common:save")} {pending.size > 0 ? `(${pending.size})` : ""}
                </Button>
              </div>

              <div className="overflow-x-auto p-5 pt-3">
                <table className="w-full min-w-max border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border-warm bg-strip">
                      <th rowSpan={2} className="sticky left-0 z-10 bg-strip px-4 py-2.5 text-[13px] font-semibold text-nav">
                        {t("table.students")}
                      </th>
                      {detail.lesson_dates.map((date) => (
                        <th key={date} colSpan={2} className="px-3 py-1.5 text-center text-[12px] font-semibold text-nav">
                          {formatDate(date, i18n.language)}
                        </th>
                      ))}
                      <th colSpan={4} className="px-3 py-1.5 text-center text-[12px] font-semibold text-nav">
                        {endOfLabel}
                      </th>
                    </tr>
                    <tr className="border-b border-border-warm bg-strip">
                      {detail.lesson_dates.map((date) => (
                        <Fragment key={date}>
                          <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">
                            {t("table.att")}
                          </th>
                          <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">
                            {t("table.score")}
                          </th>
                        </Fragment>
                      ))}
                      <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">{t("table.att")}</th>
                      <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">{t("table.bonus")}</th>
                      <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">{t("table.exam")}</th>
                      <th className="px-2 py-2 text-center text-[11px] font-medium text-muted">{t("table.sum")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.students.map((student) => {
                      const summary = student.summary;
                      const draft = draftFor(student.student_id, summary?.exam_score ?? 0, summary?.bonus_score ?? 0);
                      const summaryDirty =
                        summaryDrafts.has(student.student_id) &&
                        (draft.exam_score !== (summary?.exam_score ?? 0) || draft.bonus_score !== (summary?.bonus_score ?? 0));
                      const savingSummary = savingSummaryFor === student.student_id;

                      return (
                        <tr key={student.student_id} className="border-b border-beige last:border-b-0">
                          <td className="sticky left-0 z-10 flex items-center gap-2 bg-card px-4 py-2">
                            <PersonAvatar
                              firstName={student.first_name}
                              lastName={student.last_name}
                              size={26}
                            />
                            <span className="truncate text-sm font-medium text-ink">
                              {student.first_name} {student.last_name}
                            </span>
                          </td>

                          {detail.lesson_dates.map((date) => {
                            const cell = cellFor(student.student_id, date);
                            const dirty = pending.has(entryKey(student.student_id, date));
                            const commented = hasComment(student.student_id, date);
                            return (
                              <Fragment key={date}>
                                <td className={`px-2 py-2 text-center ${dirty ? "bg-blue-50/60" : ""}`}>
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openCommentEditor(student.student_id, date)}
                                      aria-label={t("table.comment")}
                                      className={commented ? "text-purple-600" : "text-border-warm hover:text-muted"}
                                    >
                                      <MessageSquare size={14} fill={commented ? "currentColor" : "none"} />
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={cell.attendance}
                                      onChange={(e) =>
                                        updateCell(student.student_id, date, { attendance: e.target.checked })
                                      }
                                      aria-label={t("table.att")}
                                      className="h-4 w-4 accent-maroon"
                                    />
                                  </div>
                                </td>
                                <td className={`px-2 py-2 text-center ${dirty ? "bg-blue-50/60" : ""}`}>
                                  <select
                                    value={cell.score}
                                    onChange={(e) =>
                                      updateCell(student.student_id, date, { score: Number(e.target.value) })
                                    }
                                    aria-label={t("table.score")}
                                    className="w-14 rounded-md border border-border-warm bg-card px-1 py-1 text-center text-xs text-ink"
                                  >
                                    {SCORE_OPTIONS.map((score) => (
                                      <option key={score} value={score}>
                                        {score}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </Fragment>
                            );
                          })}

                          <td className="px-2 py-2 text-center text-xs text-nav tabular-nums">
                            {summary ? `${summary.attendance_count}/${summary.total_lessons}` : "—"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={draft.bonus_score}
                              onChange={(e) =>
                                setSummaryDraft(student.student_id, summary?.exam_score ?? 0, summary?.bonus_score ?? 0, {
                                  bonus_score: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-16 rounded-md border border-border-warm bg-card px-2 py-1 text-center text-xs text-ink"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              value={draft.exam_score}
                              onChange={(e) =>
                                setSummaryDraft(student.student_id, summary?.exam_score ?? 0, summary?.bonus_score ?? 0, {
                                  exam_score: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-16 rounded-md border border-border-warm bg-card px-2 py-1 text-center text-xs text-ink"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span
                                className={`inline-flex min-w-9 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${sumBadgeClass(summary?.sum_score ?? 0)}`}
                              >
                                {summary?.sum_score ?? "—"}
                              </span>
                              {summaryDirty && (
                                <button
                                  type="button"
                                  disabled={savingSummary}
                                  onClick={() =>
                                    handleSaveSummary(
                                      student.student_id,
                                      draft.exam_score,
                                      draft.bonus_score,
                                      summary?.version ?? 0,
                                    )
                                  }
                                  className="rounded-lg border border-border-warm bg-card px-2 py-1 text-[11px] font-medium text-nav hover:bg-row-hover disabled:pointer-events-none disabled:opacity-40"
                                >
                                  {savingSummary ? t("common:saving") : t("common:save")}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <Modal open={commentTarget !== null} onClose={() => setCommentTarget(null)} title={t("table.comment")}>
        <div className="flex flex-col gap-3">
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-border-warm bg-card p-2.5 text-sm text-ink"
          />
          <Button type="button" variant="accent" onClick={saveComment}>
            {t("common:save")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
