import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalScoreCell } from "./JournalScoreCell";
import type { CellSaveStatus } from "../../lib/journals/useJournalAutosave";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalStudentRowProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  periodType: "week" | "month";
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  focusedCellKey: string | null;
  onCellFocus: (key: string) => void;
  onEntryChange: (key: string, patch: { student_id: number; lesson_date: string; attendance: boolean; score: number; comment?: string | null; version: number }) => void;
  onSummaryChange: (studentId: number, patch: { bonus_score: number; exam_score: number; version: number }) => void;
}

export const JournalStudentRow: React.FC<JournalStudentRowProps> = React.memo(({
  student,
  lessonDates,
  examMaxScore,
  cellStatus,
  focusedCellKey,
  onCellFocus,
  onEntryChange,
  onSummaryChange,
}) => {
  const { t } = useTranslation("journals");
  const summary = student.summary;

  const [bonusInput, setBonusInput] = useState<string>(
    summary ? String(summary.bonus_score) : "0"
  );
  const [examInput, setExamInput] = useState<string>(
    summary ? String(summary.exam_score) : "0"
  );

  const handleBonusBlur = () => {
    const parsed = parseInt(bonusInput, 10);
    const val = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setBonusInput(String(val));
    if (summary) {
      onSummaryChange(student.student_id, {
        bonus_score: val,
        exam_score: summary.exam_score,
        version: summary.version,
      });
    }
  };

  const handleExamBlur = () => {
    const parsed = parseInt(examInput, 10);
    const val = isNaN(parsed) ? 0 : Math.min(examMaxScore, Math.max(0, parsed));
    setExamInput(String(val));
    if (summary) {
      onSummaryChange(student.student_id, {
        bonus_score: summary.bonus_score,
        exam_score: val,
        version: summary.version,
      });
    }
  };

  const entriesMap = new Map(student.entries.map((e) => [e.lesson_date, e]));

  return (
    <tr className="hover:bg-muted/40 transition-colors border-b border-border/50">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left text-xs font-medium text-foreground border-r border-border shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]"
      >
        <div className="flex items-center gap-2">
          {student.color_hex && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: student.color_hex }}
            />
          )}
          <span className="truncate font-semibold max-w-[140px]">
            {student.first_name} {student.last_name}
          </span>
        </div>
      </th>

      {lessonDates.map((date) => {
        const entry = entriesMap.get(date);
        const cellKey = `${student.student_id}:${date}`;
        const currentVersion = entry ? entry.version : 0;
        const currentAttendance = entry ? entry.attendance : false;
        const currentScore = entry ? entry.score : 0;
        const currentComment = entry ? entry.comment : null;

        return (
          <td key={date} className="px-2 py-2 text-center align-middle">
            <JournalScoreCell
              studentId={student.student_id}
              studentName={`${student.first_name} ${student.last_name}`}
              lessonDate={date}
              attendance={currentAttendance}
              score={currentScore}
              comment={currentComment}
              version={currentVersion}
              status={cellStatus.get(cellKey)}
              isFocused={focusedCellKey === cellKey}
              onFocus={() => onCellFocus(cellKey)}
              onChange={(patch) =>
                onEntryChange(cellKey, {
                  student_id: student.student_id,
                  lesson_date: date,
                  attendance: patch.attendance,
                  score: patch.score,
                  comment: patch.comment !== undefined ? patch.comment : currentComment,
                  version: currentVersion,
                })
              }
            />
          </td>
        );
      })}

      <td className="px-2 py-2 text-center align-middle">
        <input
          type="text"
          inputMode="numeric"
          value={bonusInput}
          onChange={(e) => setBonusInput(e.target.value)}
          onBlur={handleBonusBlur}
          className="w-12 h-7 text-center text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
          aria-label={t("table.bonus")}
        />
      </td>

      <td className="px-2 py-2 text-center align-middle">
        <input
          type="text"
          inputMode="numeric"
          value={examInput}
          onChange={(e) => setExamInput(e.target.value)}
          onBlur={handleExamBlur}
          className="w-12 h-7 text-center text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
          aria-label={t("table.exam")}
        />
      </td>

      <td className="px-3 py-2 text-center align-middle font-bold text-xs tabular-nums text-foreground">
        {summary ? summary.sum_score : 0}
      </td>

      <td className="px-3 py-2 text-center align-middle text-xs tabular-nums font-semibold text-muted-foreground">
        {summary ? `${summary.percentage.toFixed(1)}%` : "0%"}
      </td>
    </tr>
  );
});
