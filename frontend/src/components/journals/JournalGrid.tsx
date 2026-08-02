import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings, AlertCircle, Check, X } from "lucide-react";
import { JournalStudentRow } from "./JournalStudentRow";
import type { CellSaveStatus } from "../../lib/journals/useJournalAutosave";
import type { JournalEntryConflictResponse, JournalStudentResponse } from "../../lib/journals/types";

interface JournalGridProps {
  students: JournalStudentResponse[];
  lessonDates: string[];
  periodType: "week" | "month";
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  conflicts: JournalEntryConflictResponse[];
  onResolveConflict: (conflict: JournalEntryConflictResponse, choice: "keepMine" | "keepTheirs") => void;
  onEntryChange: (key: string, patch: { student_id: number; lesson_date: string; attendance: boolean; score: number; comment?: string | null; version: number }) => void;
  onSummaryChange: (studentId: number, patch: { bonus_score: number; exam_score: number; version: number }) => void;
  onOpenExamWeightModal: () => void;
}

export const JournalGrid: React.FC<JournalGridProps> = ({
  students,
  lessonDates,
  periodType,
  examMaxScore,
  cellStatus,
  conflicts,
  onResolveConflict,
  onEntryChange,
  onSummaryChange,
  onOpenExamWeightModal,
}) => {
  const { t } = useTranslation("journals");
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(
    students.length > 0 && lessonDates.length > 0
      ? `${students[0].student_id}:${lessonDates[0]}`
      : null
  );

  return (
    <div className="space-y-3">
      {conflicts.length > 0 && (
        <div className="space-y-2" role="alert">
          {conflicts.map((conflict) => {
            const student = students.find((s) => s.student_id === conflict.student_id);
            const name = student ? `${student.first_name} ${student.last_name}` : `Student ${conflict.student_id}`;

            return (
              <div
                key={`${conflict.student_id}:${conflict.lesson_date}`}
                className="flex items-center justify-between gap-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-700 dark:text-red-400"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-semibold">{t("conflict.title")}</span>: {name} ({conflict.lesson_date}) — {t("conflict.body")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onResolveConflict(conflict, "keepMine")}
                    className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    {t("conflict.keepMine")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveConflict(conflict, "keepTheirs")}
                    className="px-2.5 py-1 text-xs font-semibold border border-red-500/40 rounded hover:bg-red-500/20 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    {t("conflict.keepTheirs")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="w-full overflow-x-auto border border-border rounded-xl bg-card shadow-sm">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60 border-b border-border text-muted-foreground font-semibold">
              <th scope="col" className="sticky left-0 z-20 bg-muted/90 px-4 py-3 text-left border-r border-border min-w-[160px] shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                {t("table.students")}
              </th>

              {lessonDates.map((date) => {
                const dateObj = new Date(date);
                const dateFormatted = `${dateObj.getDate().toString().padStart(2, "0")}.${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
                return (
                  <th key={date} scope="col" className="px-2 py-3 text-center min-w-[70px]">
                    {dateFormatted}
                  </th>
                );
              })}

              <th scope="col" className="px-2 py-3 text-center min-w-[60px]">
                {t("table.bonus")}
              </th>

              <th scope="col" className="px-2 py-3 text-center min-w-[75px]">
                <div className="flex items-center justify-center gap-1">
                  <span>{t("table.exam")}</span>
                  <button
                    type="button"
                    onClick={onOpenExamWeightModal}
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                    title={t("table.editExamWeight")}
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </div>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {t("table.maxN", { n: examMaxScore })}
                </span>
              </th>

              <th scope="col" className="px-3 py-3 text-center min-w-[60px]">
                {t("table.sum")}
              </th>

              <th scope="col" className="px-3 py-3 text-center min-w-[60px]">
                %
              </th>
            </tr>
          </thead>

          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={lessonDates.length + 5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("table.noStudentsInCourse")}
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <JournalStudentRow
                  key={student.student_id}
                  student={student}
                  lessonDates={lessonDates}
                  periodType={periodType}
                  examMaxScore={examMaxScore}
                  cellStatus={cellStatus}
                  focusedCellKey={focusedCellKey}
                  onCellFocus={(key) => setFocusedCellKey(key)}
                  onEntryChange={onEntryChange}
                  onSummaryChange={onSummaryChange}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic px-1">
        {t("table.gridHelp")}
      </p>
    </div>
  );
};
