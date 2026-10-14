import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalScoreCell, type CellNavDirection } from "./JournalScoreCell";
import { JournalSaveMarker } from "./JournalSaveMarker";
import {
  JournalSummaryCommands,
  type JournalEntryCommand,
  type JournalSummaryField,
  type SummaryInputVerdict,
} from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalStudentRowProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  periodType: "week" | "month";
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus?: CellSaveStatus;
  focusedCellKey: string | null;
  focusFromKeyboard: boolean;
  activeColDate?: string | null;
  animationIndex: number;
  onCellFocus: (key: string) => void;
  onCellNavigate: (key: string, direction: CellNavDirection) => void;
  onEntryCommand: (studentId: number, lessonDate: string, command: JournalEntryCommand) => void;
  onSummaryField: (studentId: number, field: JournalSummaryField, value: number) => void;
}

interface SummaryInputState {
  text: string;
  touched: boolean;
  invalidReason: Exclude<SummaryInputVerdict, { valid: true }>["reason"] | null;
}

function useSummaryInput(storedValue: number) {
  const [state, setState] = useState<SummaryInputState>({ text: String(storedValue), touched: false, invalidReason: null });
  if (!state.touched && state.text !== String(storedValue)) {
    setState({ text: String(storedValue), touched: false, invalidReason: null });
  }
  return [state, setState] as const;
}

export const JournalStudentRow: React.FC<JournalStudentRowProps> = React.memo(({
  student,
  lessonDates,
  examMaxScore,
  cellStatus,
  summaryStatus,
  focusedCellKey,
  focusFromKeyboard,
  activeColDate,
  animationIndex,
  onCellFocus,
  onCellNavigate,
  onEntryCommand,
  onSummaryField,
}) => {
  const { t } = useTranslation("journals");
  const summary = student.summary;
  const storedBonus: number = summary?.bonus_score ?? 0;
  const storedExam: number = summary?.exam_score ?? 0;

  const [bonusState, setBonusState] = useSummaryInput(storedBonus);
  const [examState, setExamState] = useSummaryInput(storedExam);

  const commitSummaryInput = (
    field: JournalSummaryField,
    state: SummaryInputState,
    setState: typeof setBonusState,
    storedValue: number,
  ) => {
    if (!state.touched) return;
    const verdict: SummaryInputVerdict = JournalSummaryCommands.judgeInput(state.text, field, examMaxScore);
    if (!verdict.valid) {
      setState({ ...state, invalidReason: verdict.reason });
      return;
    }
    setState({ text: String(verdict.value), touched: false, invalidReason: null });
    if (summary && verdict.value !== storedValue) onSummaryField(student.student_id, field, verdict.value);
  };

  const cancelSummaryInput = (setState: typeof setBonusState, storedValue: number) => {
    setState({ text: String(storedValue), touched: false, invalidReason: null });
  };

  const invalidMessage = (state: SummaryInputState): string | null => {
    if (state.invalidReason === null) return null;
    if (state.invalidReason === "aboveMaximum") return t("table.summaryInvalid.aboveMaximum", { n: examMaxScore });
    return t("table.summaryInvalid.wholeNumber");
  };

  const renderSummaryInput = (
    field: JournalSummaryField,
    state: SummaryInputState,
    setState: typeof setBonusState,
    storedValue: number,
    label: string,
  ) => {
    const message: string | null = invalidMessage(state);
    return (
      <div className="relative inline-block">
        {field === "exam_score" && summaryStatus && (
          <JournalSaveMarker status={summaryStatus} className="absolute -top-1.5 -right-1.5 z-10" />
        )}
        <input
          type="text"
          inputMode="numeric"
          value={state.text}
          onChange={(e) => setState({ text: e.target.value, touched: true, invalidReason: null })}
          onBlur={() => commitSummaryInput(field, state, setState, storedValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitSummaryInput(field, state, setState, storedValue);
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelSummaryInput(setState, storedValue);
            }
          }}
          aria-invalid={message !== null}
          aria-label={label}
          className={`w-12 h-7 text-center text-xs border rounded bg-card text-ink focus:outline-none focus:ring-1 focus:ring-accent tabular-nums ${
            message !== null ? "border-destructive" : "border-border"
          }`}
        />
        {message !== null && (
          <span
            role="alert"
            className="absolute left-1/2 top-full z-10 mt-0.5 w-max max-w-[140px] -translate-x-1/2 rounded bg-danger-surface px-1.5 py-0.5 text-[10px] font-medium text-destructive"
          >
            {message}
          </span>
        )}
      </div>
    );
  };

  const entriesMap = new Map(student.entries.map((e) => [e.lesson_date, e]));

  return (
    <tr
      className="group/row hover:bg-row-hover transition-colors border-b border-border-warm last:border-b-0 motion-safe:animate-[row-fade-in_200ms_ease-out_both]"
      style={{ animationDelay: `${animationIndex * 30}ms` }}
    >
      <th
        scope="row"
        className="sticky left-0 z-10 bg-card group-hover/row:bg-row-hover transition-colors px-4 py-2.5 text-left text-xs font-medium text-ink border-r border-border"
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
        const currentAttendance = entry ? entry.attendance : false;
        const currentScore = entry ? entry.score : 0;
        const currentComment = entry ? entry.comment : null;

        return (
          <td
            key={date}
            className={`px-2 py-2 text-center align-middle transition-colors ${
              date === activeColDate ? "bg-maroon/5 dark:bg-accent/5" : ""
            }`}
          >
            <JournalScoreCell
              studentName={`${student.first_name} ${student.last_name}`}
              lessonDate={date}
              attendance={currentAttendance}
              score={currentScore}
              comment={currentComment}
              status={cellStatus.get(cellKey)}
              isFocused={focusedCellKey === cellKey}
              autoFocus={focusedCellKey === cellKey && focusFromKeyboard}
              onFocus={() => onCellFocus(cellKey)}
              onNavigate={(direction) => onCellNavigate(cellKey, direction)}
              onCommand={(command) => onEntryCommand(student.student_id, date, command)}
            />
          </td>
        );
      })}

      <td className="px-2 py-2 text-center align-middle">
        {renderSummaryInput("bonus_score", bonusState, setBonusState, storedBonus, t("table.bonus"))}
      </td>

      <td className="px-2 py-2 text-center align-middle">
        {renderSummaryInput("exam_score", examState, setExamState, storedExam, t("table.exam"))}
      </td>

      <td className="sticky right-16 z-10 w-16 min-w-16 bg-card group-hover/row:bg-row-hover transition-colors border-l border-border px-3 py-2 text-center align-middle font-bold text-xs tabular-nums text-ink">
        {summary ? summary.sum_score : 0}
      </td>

      <td className="sticky right-0 z-10 w-16 min-w-16 bg-card group-hover/row:bg-row-hover transition-colors px-3 py-2 text-center align-middle text-xs tabular-nums font-semibold text-muted">
        {summary ? `${summary.percentage.toFixed(1)}%` : "0%"}
      </td>
    </tr>
  );
});
