import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatDate } from "../../i18n/formatters";
import type { JournalRegistryConflict } from "../../lib/journals/JournalQueueRegistry";
import type { JournalAutosaveConflict } from "../../lib/journals/journalQueueTypes";
import type { JournalEntryValue, JournalSummaryValue } from "../../lib/journals/journalCommands";
import type { JournalDetailResponse, JournalEntryStateResponse, JournalStudentSummaryResponse } from "../../lib/journals/types";

interface JournalConflictReviewProps {
  open: boolean;
  conflicts: JournalRegistryConflict[];
  refetching: boolean;
  onClose: () => void;
  onResolve: (journalId: number, conflict: JournalAutosaveConflict, choice: "keepMine" | "keepTheirs") => void;
  onRefetch: (journalId: number) => void;
}

interface ValueColumnProps {
  heading: string;
  children: React.ReactNode;
  testId: string;
}

const ValueColumn: React.FC<ValueColumnProps> = ({ heading, children, testId }) => (
  <div data-testid={testId} className="min-w-0 flex-1 rounded-lg border border-border bg-strip p-3">
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</div>
    <div className="space-y-1 text-xs text-ink">{children}</div>
  </div>
);

export const JournalConflictReview: React.FC<JournalConflictReviewProps> = ({
  open,
  conflicts,
  refetching,
  onClose,
  onResolve,
  onRefetch,
}) => {
  const { t } = useTranslation("journals");
  const queryClient = useQueryClient();
  const requestedJournalIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      requestedJournalIds.current.clear();
      return;
    }
    if (refetching) return;
    conflicts.forEach(({ journalId, conflict }) => {
      if (conflict.current !== undefined || requestedJournalIds.current.has(journalId)) return;
      requestedJournalIds.current.add(journalId);
      onRefetch(journalId);
    });
  }, [open, conflicts, refetching, onRefetch]);

  const renderEntryValue = (value: JournalEntryValue | JournalEntryStateResponse) => (
    <>
      <div>
        {t("conflict.attendanceLabel")}: {value.attendance ? t("conflict.attendancePresent") : t("conflict.attendanceAbsent")}
      </div>
      <div className="tabular-nums">
        {t("conflict.scoreLabel")}: {"is_graded" in value && value.is_graded === false ? "—" : value.score}
      </div>
      <div className="whitespace-pre-wrap break-words">
        {t("conflict.commentLabel")}: {value.comment && value.comment.length > 0 ? value.comment : t("conflict.noComment")}
      </div>
    </>
  );

  const renderSummaryValue = (value: JournalSummaryValue | JournalStudentSummaryResponse) => (
    <>
      <div className="tabular-nums">
        {t("conflict.bonusLabel")}: {value.bonus_score}
      </div>
      <div className="tabular-nums">
        {t("conflict.examLabel")}: {value.exam_score}
      </div>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("conflict.listTitle")} maxWidthClassName="max-w-2xl" fullScreenOnMobile>
      <ul className="flex flex-col gap-4" data-testid="conflict-review-list">
        {conflicts.map(({ journalId, conflict }) => {
          const detail: JournalDetailResponse | undefined = queryClient.getQueryData<JournalDetailResponse>([
            "journals",
            "detail",
            journalId,
          ]);
          const student = detail?.students.find((candidate) => candidate.student_id === conflict.student_id);
          const studentName: string = student
            ? `${student.first_name} ${student.last_name}`
            : t("conflict.studentFallback", { id: conflict.student_id });
          const context: string =
            conflict.type === "summary"
              ? t("conflict.pairedSummary")
              : t("conflict.lessonContext", { date: formatDate(conflict.lesson_date, undefined, "UTC") });
          const itemKey: string =
            conflict.type === "summary"
              ? `${journalId}:${conflict.student_id}:summary`
              : `${journalId}:${conflict.student_id}:${conflict.lesson_date}`;
          const isUnavailable: boolean = conflict.current === null;
          const isUnknown: boolean = conflict.current === undefined;

          return (
            <li key={itemKey} className="rounded-xl border border-destructive/40 bg-card p-3.5" data-testid="conflict-review-item">
              <div className="mb-0.5 text-sm font-semibold text-ink">{studentName}</div>
              <div className="mb-0.5 text-xs text-muted">{detail?.period_label}</div>
              <div className="mb-3 text-xs font-medium text-ink">{context}</div>

              {isUnavailable && (
                <div role="note" className="mb-3 rounded-lg bg-danger-surface p-2.5 text-xs text-destructive">
                  <div className="font-semibold">{t("conflict.entryUnavailable")}</div>
                  <div>{t("conflict.entryUnavailableBody")}</div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <ValueColumn heading={t("conflict.yourValue")} testId="conflict-your-value">
                  {conflict.mine
                    ? conflict.type === "summary"
                      ? renderSummaryValue(conflict.mine as JournalSummaryValue)
                      : renderEntryValue(conflict.mine as JournalEntryValue)
                    : null}
                </ValueColumn>
                <ValueColumn heading={t("conflict.serverValue")} testId="conflict-server-value">
                  {conflict.current
                    ? conflict.type === "summary"
                      ? renderSummaryValue(conflict.current as JournalStudentSummaryResponse)
                      : renderEntryValue(conflict.current as JournalEntryStateResponse)
                    : isUnavailable
                      ? t("conflict.entryUnavailable")
                      : refetching ? t("conflict.serverLoading") : t("conflict.serverNotLoaded")}
                </ValueColumn>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  className="text-xs"
                  disabled={isUnavailable || isUnknown || refetching}
                  onClick={() => onResolve(journalId, conflict, "keepMine")}
                >
                  {t("conflict.keepMine")}
                </Button>
                {(isUnavailable || isUnknown) && (
                  <Button type="button" variant="secondary" className="text-xs" disabled={refetching} onClick={() => onRefetch(journalId)}>
                    {refetching ? t("conflict.refetching") : t("conflict.refetch")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs"
                  disabled={isUnknown || refetching}
                  onClick={() => onResolve(journalId, conflict, "keepTheirs")}
                >
                  {isUnavailable ? t("conflict.discardMine") : t("conflict.useServer")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};
