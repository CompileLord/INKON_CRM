import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Calendar, Layers } from "lucide-react";
import { useJournal, useUpdateJournalExamMaxScore } from "../../lib/journals/hooks";
import { useJournalAutosave } from "../../lib/journals/useJournalAutosave";
import { JournalGrid } from "./JournalGrid";
import { JournalSaveStatus } from "./JournalSaveStatus";
import { ExamWeightModal } from "./ExamWeightModal";
import { PeriodStateBadge, type PeriodState } from "./PeriodStateBadge";

interface JournalPeriodSectionProps {
  period: {
    id: number;
    period_label: string;
    period_start: string;
    period_end: string;
    period_type: "week" | "month";
    exam_max_score?: number;
    student_count?: number;
    lesson_count?: number;
    cells_expected?: number;
    cells_filled?: number;
    avg_percentage?: number | null;
    state?: PeriodState;
  };
  courseId: number;
  isCurrentPeriod?: boolean;
  defaultExpanded?: boolean;
}

export const JournalPeriodSection: React.FC<JournalPeriodSectionProps> = ({
  period,
  courseId,
  isCurrentPeriod = false,
  defaultExpanded = false,
}) => {
  const { t } = useTranslation("journals");
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  const { data: detail, isLoading, isError } = useJournal(expanded ? period.id : undefined);
  const updateExamMaxScoreMutation = useUpdateJournalExamMaxScore(period.id, courseId);

  const autosave = useJournalAutosave(expanded ? period.id : undefined, courseId);

  const handleToggleExpand = async () => {
    if (expanded && autosave.hasPendingEdits) {
      await autosave.flush();
    }
    setExpanded((prev) => !prev);
  };

  const handleSaveExamMaxScore = async (newWeight: number) => {
    await updateExamMaxScoreMutation.mutateAsync({ exam_max_score: newWeight });
  };

  let computedAvg = 0;
  if (detail && detail.students.length > 0) {
    let percentSum = 0;
    detail.students.forEach((student) => {
      if (student.summary) {
        percentSum += student.summary.percentage;
      }
    });
    computedAvg = percentSum / detail.students.length;
  }
  const effectiveAvg = computedAvg > 0 ? computedAvg : (period.avg_percentage ?? 0);

  return (
    <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden transition-all duration-200">
      <div
        onClick={handleToggleExpand}
        className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-row-hover transition-colors select-none"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div className="p-1 rounded-md text-muted group-hover:text-ink transition-colors">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-ink">{period.period_label}</h3>
              {isCurrentPeriod && (
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-maroon/10 text-maroon dark:bg-maroon/20 dark:text-red-400 border border-maroon/20">
                  {t("period.current")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {t("period.range", { start: period.period_start, end: period.period_end })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {expanded && (
            <div onClick={(e) => e.stopPropagation()}>
              <JournalSaveStatus
                status={autosave.aggregateStatus}
                hasPendingEdits={autosave.hasPendingEdits}
                onSaveNow={autosave.flush}
                onRetry={autosave.retryManual}
              />
            </div>
          )}

          {!expanded && (
            <div className="flex items-center gap-3 text-xs">
              {period.state && <PeriodStateBadge state={period.state} />}
              {period.cells_expected !== undefined && period.cells_expected > 0 && (
                <span className="text-muted tabular-nums text-xs">
                  {period.cells_filled ?? 0}/{period.cells_expected}
                </span>
              )}
              <span className="flex items-center gap-1 font-medium text-muted bg-beige px-2.5 py-1 rounded-md tabular-nums">
                <Layers className="w-3.5 h-3.5" />
                {effectiveAvg > 0 ? t("period.average", { avg: effectiveAvg.toFixed(1) }) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border-warm">
          {isLoading && (
            <div className="py-8 text-center text-xs text-muted">
              {t("loading")}
            </div>
          )}

          {isError && (
            <div className="py-8 text-center text-xs text-red-600 dark:text-red-400">
              {t("loadFailed")}
            </div>
          )}

          {detail && (
            <JournalGrid
              students={detail.students}
              lessonDates={detail.lesson_dates}
              periodType={period.period_type}
              examMaxScore={detail.exam_max_score}
              cellStatus={autosave.cellStatus}
              conflicts={autosave.conflicts}
              onResolveConflict={autosave.resolveConflict}
              onEntryChange={autosave.editEntry}
              onSummaryChange={autosave.editSummary}
              onOpenExamWeightModal={() => setIsExamModalOpen(true)}
            />
          )}
        </div>
      )}

      {isExamModalOpen && detail && (
        <ExamWeightModal
          isOpen={isExamModalOpen}
          currentWeight={detail.exam_max_score}
          onClose={() => setIsExamModalOpen(false)}
          onSave={handleSaveExamMaxScore}
        />
      )}
    </div>
  );
};
