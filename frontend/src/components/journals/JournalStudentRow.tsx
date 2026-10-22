import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { JournalScoreCell, type CellNavDirection, type JournalCellControl } from "./JournalScoreCell";
import { JournalReadOnlyCell } from "./JournalReadOnlyCell";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalSummaryCell } from "./JournalSummaryCell";
import { formatNumber } from "../../i18n/formatters";
import { WholePercent } from "../../lib/students/WholePercent";
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
  examMaximum: number;
  bonusMaximum?: number;
  sharedMaximum?: number;
  atRisk?: boolean;
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
  examMaximum,
  bonusMaximum,
  sharedMaximum,
  atRisk = false,
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
        className={`sticky left-0 z-20 w-[200px] min-w-[200px] max-w-[200px] border-b border-r border-border bg-clip-padding px-4 shadow-[1px_0_0_0_var(--color-border)] py-2 text-left text-sm font-semibold leading-5 text-ink group-hover/row:bg-row-hover ${
          isSelf ? "border-l-4 border-l-maroon bg-beige dark:border-l-accent" : "bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate" title={studentName}>{studentName}</span>
          {atRisk && (
            <span
              data-testid="at-risk-marker"
              role="img"
              aria-label={t("atRisk.label")}
              title={t("atRisk.tooltip")}
              className="shrink-0 text-warning"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
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
            className={`min-w-[128px] border-b border-border px-1 py-2 text-center align-middle motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out group-hover/row:bg-row-hover ${
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
                comment={markUnrecorded && !isSelf ? null : currentComment}
                status={cellStatus.get(cellKey)}
                recorded={!markUnrecorded || entry !== undefined}
              />
            )}
          </td>
        );
      })}

      {[
        { field: "exam_score" as const, value: summary ? summary.exam_score : 0 },
        { field: "bonus_score" as const, value: summary ? summary.bonus_score : 0 },
      ].map(({ field, value }, fieldIndex) => (
        <td
          key={field}
          className={`border-b border-border px-2 py-2 text-center align-middle text-sm group-hover/row:bg-row-hover ${
            fieldIndex === 0 ? "border-l" : ""
          } ${isSelf ? "bg-beige" : ""}`}
        >
          {summary ? (
            <JournalSummaryCell
              studentName={studentName}
              field={field}
              value={value}
              examMaximum={examMaximum}
              bonusMaximum={bonusMaximum}
              rejected={summaryStatus === "error"}
              editable={editing !== null}
              onCommit={(committed) =>
                editing?.onSummaryPair(student.student_id, {
                  exam_score: field === "exam_score" ? committed : summary.exam_score,
                  bonus_score: field === "bonus_score" ? committed : summary.bonus_score,
                  version: summary.version,
                })
              }
            />
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      ))}

      <td className={`border-b border-l border-border px-2 py-2 text-center align-middle text-sm tabular-nums group-hover/row:bg-row-hover ${isSelf ? "bg-beige" : ""}`} data-testid="total-cell">
        <span className="inline-flex items-center gap-1.5">
          {summaryStatus && <JournalSaveMarker status={summaryStatus} className="relative" />}
          {summary ? (
            <span className="flex flex-col items-center leading-5">
              <span>
                <span className="font-semibold text-ink">{formatNumber(summary.sum_score)}</span>
                {summary.max_period_score > 0 && summary.max_period_score !== sharedMaximum && (
                  <span className="text-muted" data-testid="total-row-maximum"> {t("table.sumMaximum", { max: formatNumber(summary.max_period_score) })}</span>
                )}
              </span>
              {summary.max_period_score > 0 && <span className="text-xs text-muted" data-testid="total-percentage">{WholePercent.format(summary.percentage)}</span>}
            </span>
          ) : (
            <span className="text-muted">{t("summary.unavailable")}</span>
          )}
        </span>
      </td>
    </tr>
  );
});
