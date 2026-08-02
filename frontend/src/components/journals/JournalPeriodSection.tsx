import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Calendar, Layers } from "lucide-react";
import { useJournal, useUpdateJournalExamMaxScore } from "../../lib/journals/hooks";
import { useJournalAutosave } from "../../lib/journals/useJournalAutosave";
import { JournalGrid } from "./JournalGrid";
import { JournalSaveStatus } from "./JournalSaveStatus";
import { ExamWeightModal } from "./ExamWeightModal";

interface JournalPeriodSectionProps {
  period: {
    id: number;
    period_label: string;
    period_start: string;
    period_end: string;
    period_type: "week" | "month";
    exam_max_score: number;
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

  let totalMarked = 0;
  let totalCells = 0;
  let periodAvg = 0;

  if (detail && detail.students.length > 0) {
    const studentCount = detail.students.length;
    const lessonCount = detail.lesson_dates.length;
    totalCells = studentCount * lessonCount;

    let markedSum = 0;
    let percentSum = 0;

    detail.students.forEach((student) => {
      markedSum += student.entries.filter((e) => e.attendance || e.score > 0).length;
      if (student.summary) {
        percentSum += student.summary.percentage;
      }
    });

    totalMarked = markedSum;
    periodAvg = percentSum / studentCount;
  }

  return (
    <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden transition-all duration-200">
      <div
        onClick={handleToggleExpand}
        className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
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
          <div className="p-1 rounded-md text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-foreground">{period.period_label}</h3>
              {isCurrentPeriod && (
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-maroon/10 text-maroon dark:bg-maroon/20 dark:text-red-400 border border-maroon/20">
                  {t("period.current")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
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
              <span className="flex items-center gap-1 font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
                <Layers className="w-3.5 h-3.5" />
                {periodAvg > 0 ? t("period.average", { avg: periodAvg.toFixed(1) }) : "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border/60">
          {isLoading && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          )}

          {isError && (
            <div className="py-8 text-center text-xs text-destructive">
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
