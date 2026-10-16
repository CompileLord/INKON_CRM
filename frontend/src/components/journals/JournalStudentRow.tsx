import React from "react";
import { useTranslation } from "react-i18next";
import { JournalScoreCell, type CellNavDirection, type JournalCellControl } from "./JournalScoreCell";
import { JournalReadOnlyCell } from "./JournalReadOnlyCell";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { formatNumber, formatPercentage } from "../../i18n/formatters";
import type { JournalEntryCommand } from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

export interface JournalRowEditing {
  onEntryCommand: (studentId: number, lessonDate: string, command: JournalEntryCommand) => void;
  onSummaryPair: (studentId: number, values: { bonus_score: number; exam_score: number; version: number }) => void;
}

interface JournalStudentRowProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  selectedLesson: string | undefined;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus?: CellSaveStatus;
  focusedCellKey: string | null;
  focusFromKeyboard: boolean;
  editing: JournalRowEditing | null;
  isSelf?: boolean;
  markUnrecorded?: boolean;
  onCellFocus: (key: string, control: JournalCellControl) => void;
  onCellNavigate: (key: string, direction: CellNavDirection) => void;
}

export const JournalStudentRow: React.FC<JournalStudentRowProps> = React.memo(({
  student,
  lessonDates,
  selectedLesson,
  cellStatus,
  summaryStatus,
  focusedCellKey,
  focusFromKeyboard,
  editing,
  isSelf = false,
  markUnrecorded = false,
  onCellFocus,
  onCellNavigate,
}) => {
  const { t } = useTranslation("journals");
  const summary = student.summary;
  const studentName: string = `${student.first_name} ${student.last_name}`;

  const entriesMap = new Map(student.entries.map((e) => [e.lesson_date, e]));

  return (
    <tr className="group/row" data-self={isSelf ? "true" : undefined}>
      <th
        scope="row"
        className={`sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] border-b border-r border-border px-4 py-2 text-left text-sm font-semibold leading-5 text-ink group-hover/row:bg-row-hover ${
          isSelf ? "border-l-4 border-l-maroon bg-beige dark:border-l-accent" : "bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          {student.color_hex && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: student.color_hex }}
            />
          )}
          <span className="min-w-0 break-words">{studentName}</span>
          {isSelf && (
            <span className="shrink-0 rounded-full bg-info-surface px-2 text-xs font-semibold text-ink">{t("readOnly.you")}</span>
          )}
        </div>
      </th>

      {lessonDates.map((date) => {
        const entry = entriesMap.get(date);
        const cellKey = `${student.student_id}:${date}`;
        const currentAttendance = entry ? entry.attendance : false;
        const currentScore = entry ? entry.score : 0;
        const currentComment = entry ? entry.comment : null;

        return (
          <td
            key={date}
            className={`min-w-[160px] border-b border-border px-1 py-2 text-center align-middle motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out group-hover/row:bg-row-hover ${
              date === selectedLesson ? "bg-info-surface" : isSelf ? "bg-beige" : ""
            }`}
          >
            {editing ? (
              <JournalScoreCell
                studentId={student.student_id}
                studentName={studentName}
                lessonDate={date}
                attendance={currentAttendance}
                score={currentScore}
                comment={currentComment}
                status={cellStatus.get(cellKey)}
                isFocused={focusedCellKey === cellKey}
                autoFocus={focusedCellKey === cellKey && focusFromKeyboard}
                onFocus={(control) => onCellFocus(cellKey, control)}
                onNavigate={(direction) => onCellNavigate(cellKey, direction)}
                onCommand={(command) => editing.onEntryCommand(student.student_id, date, command)}
              />
            ) : (
              <JournalReadOnlyCell
                studentName={studentName}
                lessonDate={date}
                attendance={currentAttendance}
                score={currentScore}
                comment={currentComment}
                status={cellStatus.get(cellKey)}
                recorded={!markUnrecorded || entry !== undefined}
              />
            )}
          </td>
        );
      })}

      <td className={`min-w-[96px] border-b border-l border-border px-2 py-2 text-center align-middle text-sm font-semibold tabular-nums text-ink group-hover/row:bg-row-hover ${isSelf ? "bg-beige" : ""}`}>
        <span className="inline-flex items-center gap-1.5">
          {summaryStatus && <JournalSaveMarker status={summaryStatus} className="relative" />}
          {summary ? formatNumber(summary.sum_score) : t("summary.unavailable")}
        </span>
      </td>

      <td className={`min-w-[80px] border-b border-border px-2 py-2 text-center align-middle text-sm font-semibold tabular-nums text-muted group-hover/row:bg-row-hover ${isSelf ? "bg-beige" : ""}`}>
        {summary
          ? formatPercentage(summary.percentage)
          : "—"}
      </td>
    </tr>
  );
});
