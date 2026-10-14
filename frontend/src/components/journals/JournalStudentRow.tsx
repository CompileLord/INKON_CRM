import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalScoreCell, type CellNavDirection, type JournalCellControl } from "./JournalScoreCell";
import { JournalReadOnlyCell } from "./JournalReadOnlyCell";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { formatNumber } from "../../i18n/formatters";
import {
  JournalSummaryCommands,
  type JournalEntryCommand,
  type JournalSummaryField,
  type SummaryInputVerdict,
} from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

export interface JournalRowEditing {
  onEntryCommand: (studentId: number, lessonDate: string, command: JournalEntryCommand) => void;
  onSummaryField: (studentId: number, field: JournalSummaryField, value: number) => void;
}

interface JournalStudentRowProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  selectedLesson: string | undefined;
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus?: CellSaveStatus;
  focusedCellKey: string | null;
  focusFromKeyboard: boolean;
  editing: JournalRowEditing | null;
  onCellFocus: (key: string, control: JournalCellControl) => void;
  onCellNavigate: (key: string, direction: CellNavDirection) => void;
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
  selectedLesson,
  examMaxScore,
  cellStatus,
  summaryStatus,
  focusedCellKey,
  focusFromKeyboard,
  editing,
  onCellFocus,
  onCellNavigate,
}) => {
  const { t } = useTranslation("journals");
  const summary = student.summary;
  const storedBonus: number = summary?.bonus_score ?? 0;
  const storedExam: number = summary?.exam_score ?? 0;
  const studentName: string = `${student.first_name} ${student.last_name}`;
  const rowHoldsFocus: boolean = focusedCellKey !== null && focusedCellKey.startsWith(`${student.student_id}:`);

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
    if (editing && summary && verdict.value !== storedValue) editing.onSummaryField(student.student_id, field, verdict.value);
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
    if (!editing) {
      return <span className="tabular-nums text-ink">{storedValue}</span>;
    }
    const message: string | null = invalidMessage(state);
    return (
      <div className="relative inline-block">
        {field === "exam_score" && summaryStatus && (
          <JournalSaveMarker status={summaryStatus} className="absolute -top-1.5 -right-1.5 z-10" />
        )}
        <input
          type="text"
          inputMode="numeric"
          tabIndex={rowHoldsFocus ? 0 : -1}
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
          aria-label={t("table.summaryFieldLabel", { field: label, name: studentName })}
          className={`h-11 w-16 rounded-[10px] border bg-card text-center text-sm tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-ring ${
            message !== null ? "border-destructive" : "border-control-border"
          }`}
        />
        {message !== null && (
          <span
            role="alert"
            className="absolute left-1/2 top-full z-10 mt-0.5 w-max max-w-[140px] -translate-x-1/2 rounded bg-danger-surface px-1.5 py-0.5 text-xs font-medium text-destructive"
          >
            {message}
          </span>
        )}
      </div>
    );
  };

  const entriesMap = new Map(student.entries.map((e) => [e.lesson_date, e]));

  return (
    <tr className="group/row">
      <th
        scope="row"
        className="sticky left-0 z-10 w-[200px] min-w-[200px] max-w-[200px] border-b border-r border-border bg-card px-4 py-2 text-left text-sm font-semibold leading-5 text-ink group-hover/row:bg-row-hover"
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
            className={`min-w-[160px] border-b border-border px-1 py-2 text-center align-middle group-hover/row:bg-row-hover ${
              date === selectedLesson ? "bg-info-surface" : ""
            }`}
          >
            {editing ? (
              <JournalScoreCell
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
              />
            )}
          </td>
        );
      })}

      <td className="min-w-[88px] border-b border-l border-border px-2 py-2 text-center align-middle group-hover/row:bg-row-hover">
        {renderSummaryInput("bonus_score", bonusState, setBonusState, storedBonus, t("table.bonus"))}
      </td>

      <td className="min-w-[88px] border-b border-border px-2 py-2 text-center align-middle group-hover/row:bg-row-hover">
        {renderSummaryInput("exam_score", examState, setExamState, storedExam, t("table.exam"))}
      </td>

      <td className="min-w-[80px] border-b border-border px-2 py-2 text-center align-middle text-sm font-semibold tabular-nums text-ink group-hover/row:bg-row-hover">
        {summary ? formatNumber(summary.sum_score) : "—"}
      </td>

      <td className="min-w-[80px] border-b border-border px-2 py-2 text-center align-middle text-sm font-semibold tabular-nums text-muted group-hover/row:bg-row-hover">
        {summary
          ? `${formatNumber(summary.percentage, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
          : "—"}
      </td>
    </tr>
  );
});
