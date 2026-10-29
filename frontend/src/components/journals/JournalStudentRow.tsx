import React from "react";
import { useTranslation } from "react-i18next";
import { EmptyValue } from "../ui/EmptyValue";
import { Tooltip } from "../ui/Tooltip";
import { AlertTriangle } from "lucide-react";
import { JournalScoreCell, type CellNavDirection, type JournalCellControl } from "./JournalScoreCell";
import { JournalReadOnlyCell } from "./JournalReadOnlyCell";
import { JournalSaveMarker } from "./JournalSaveMarker";
import { JournalSummaryCell } from "./JournalSummaryCell";
import { formatNumber, getSchoolCalendarDate } from "../../i18n/formatters";
import type { JournalEntryCommand } from "../../lib/journals/journalCommands";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalCellRejectionCode, JournalStudentResponse } from "../../lib/journals/types";

export interface JournalRowEditing {
  onEntryCommand: (studentId: number, lessonDate: string, command: JournalEntryCommand) => void;
  onSummaryPair: (studentId: number, values: { bonus_score: number; exam_score: number; version: number }) => void;
}

interface JournalStudentRowProps {
  student: JournalStudentResponse;
  lessonDates: string[];
  selectedLesson: string | undefined;
  cellStatus: Map<string, CellSaveStatus>;
  cellRejections?: Map<string, JournalCellRejectionCode>;
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
  compact?: boolean;
  compactLessons?: boolean;
  onCellFocus: (key: string, control: JournalCellControl) => void;
  onCellNavigate: (key: string, direction: CellNavDirection) => void;
}

export const JournalStudentRow: React.FC<JournalStudentRowProps> = React.memo(({
  student,
  lessonDates,
  selectedLesson,
  cellStatus,
  cellRejections,
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
  compact = false,
  compactLessons = false,
  onCellFocus,
  onCellNavigate,
}) => {
  const { t } = useTranslation("journals");
  const summary = student.summary;
  const studentName: string = `${student.first_name} ${student.last_name}`;

  const nothingGraded: boolean = markUnrecorded && !student.entries.some((entry) => entry.attendance || entry.score > 0 || Boolean(entry.comment)) && (summary === null || summary === undefined || (summary.sum_score === 0 && summary.exam_score === 0 && summary.bonus_score === 0));

  const today: string = getSchoolCalendarDate();
  const entriesMap = new Map(student.entries.map((e) => [e.lesson_date, e]));

  return (
    <tr className="group/row" data-self={isSelf ? "true" : undefined}>
      <th
        scope="row"
        className={`sticky left-0 z-20 ${compact ? "w-[120px] min-w-[120px] max-w-[120px] px-2" : "w-[200px] min-w-[200px] max-w-[200px] px-4"} border-b border-r border-border bg-clip-padding shadow-[1px_0_0_0_var(--color-border)] py-2 text-left text-sm font-semibold leading-5 text-ink group-hover/row:bg-row-hover ${
          isSelf ? "border-l-4 border-l-maroon bg-beige dark:border-l-accent" : "bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate" title={studentName}>{studentName}</span>
          {atRisk && (
            <Tooltip content={t("atRisk.tooltip")} focusable>
              <span
                data-testid="at-risk-marker"
                role="img"
                aria-label={t("atRisk.label")}
                className="shrink-0 text-warning"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
            </Tooltip>
          )}
          {isSelf && (
            <span className={compact ? "sr-only" : "shrink-0 rounded-full bg-info-surface px-2 text-xs font-semibold text-ink"}>{t("readOnly.you")}</span>
          )}
        </div>
      </th>

      {lessonDates.map((date) => {
        const entry = entriesMap.get(date);
        const cellKey = `${student.student_id}:${date}`;
        const currentAttendance: boolean = entry?.attendance ?? false;
        const currentScore = entry ? entry.score : 0;
        const currentComment = entry ? entry.comment : null;
        const currentGraded: boolean = entry ? entry.is_graded : false;
        const rejectionCode: JournalCellRejectionCode | undefined = cellRejections?.get(cellKey);

        return (
          <td
            key={date}
            className={`${compactLessons ? "min-w-[112px]" : "min-w-[128px]"} border-b border-border px-1 py-2 text-center align-middle motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out group-hover/row:bg-row-hover ${
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
                graded={currentGraded}
                disabled={date > today}
                rejectionMessage={rejectionCode ? t(`rejection.${rejectionCode}`) : undefined}
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
                graded={currentGraded}
                comment={markUnrecorded && !isSelf ? null : currentComment}
                status={cellStatus.get(cellKey)}
                recorded={entry?.attendance !== null && (!markUnrecorded || entry !== undefined)}
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
          {summary && !nothingGraded ? (
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
            nothingGraded ? <EmptyValue reason={t("table.notRecorded")} /> : <span className="text-muted">—</span>
          )}
        </td>
      ))}

      <td className={`border-b border-l border-border px-2 py-2 text-center align-middle text-sm tabular-nums group-hover/row:bg-row-hover ${isSelf ? "bg-beige" : ""}`} data-testid="total-cell">
        <span className="inline-flex items-center gap-1.5">
          {summaryStatus && <JournalSaveMarker status={summaryStatus} className="relative" />}
          {nothingGraded ? (
            <span data-testid="total-not-graded"><EmptyValue reason={t("table.notRecorded")} /></span>
          ) : summary ? (
            <span className="leading-5">
              <span className="font-semibold text-ink">{formatNumber(summary.sum_score)}</span>
              {summary.max_period_score > 0 && summary.max_period_score !== sharedMaximum && (
                <span className="text-muted" data-testid="total-row-maximum"> {t("table.sumMaximum", { max: formatNumber(summary.max_period_score) })}</span>
              )}
            </span>
          ) : (
            <span className="text-muted">{t("summary.unavailable")}</span>
          )}
        </span>
      </td>
    </tr>
  );
});
