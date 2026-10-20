import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { JournalLessonColumnMenu } from "./JournalLessonColumnMenu";
import { JournalStudentRow, type JournalRowEditing } from "./JournalStudentRow";
import { useJournalGridViewport } from "./useJournalGridViewport";
import type { CellNavDirection, JournalCellControl } from "./JournalScoreCell";
import { formatSchoolLessonDate, formatSchoolLessonWeekday, getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalAtRiskRules } from "../../lib/journals/JournalAtRiskRules";
import { JournalBulkFill, type JournalBulkFillKind } from "../../lib/journals/JournalBulkFill";
import { JournalStudentOrdering, useStableStudentOrder } from "../../lib/journals/JournalStudentOrdering";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalGridProps {
  journalId: number;
  periodLabel: string;
  students: JournalStudentResponse[];
  lessonDates: string[];
  selectedLesson: string | undefined;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus: Map<number, CellSaveStatus>;
  editing: JournalRowEditing | null;
  onSelectLesson: (lessonDate: string) => void;
  visibleStudentIds?: Set<number> | null;
  onAnchor?: (studentId: number, control: string) => void;
  readOnlySelfStudentId?: number | null;
  examMaximum?: number;
  bonusMaximum?: number;
}

interface GridFocus {
  journalId: number;
  studentId: number;
  lessonDate: string;
  control: JournalCellControl;
  fromKeyboard: boolean;
}

const STICKY_STUDENT_COLUMN_PX = 200;
const LESSON_COLUMN_PX = 128;
const SUMMARY_FIELD_COLUMN_PX = 96;
const TOTAL_COLUMN_PX = 136;
const SHELL_HEADER_OFFSET = "calc(3.5rem + 1px + env(safe-area-inset-top))";
const VISIBLE_EDGE_PADDING_PX = 8;
const DEFAULT_EXAM_MAXIMUM = 100;

function cellKeyOf(studentId: number, lessonDate: string): string {
  return `${studentId}:${lessonDate}`;
}

function splitCellKey(key: string): { studentId: number; lessonDate: string } {
  const separatorIndex: number = key.indexOf(":");
  return { studentId: Number(key.slice(0, separatorIndex)), lessonDate: key.slice(separatorIndex + 1) };
}

export const JournalGrid: React.FC<JournalGridProps> = ({
  journalId,
  periodLabel,
  students: serverOrderedStudents,
  lessonDates,
  selectedLesson,
  cellStatus,
  summaryStatus,
  editing,
  onSelectLesson,
  visibleStudentIds = null,
  onAnchor,
  readOnlySelfStudentId = null,
  examMaximum = DEFAULT_EXAM_MAXIMUM,
  bonusMaximum,
}) => {
  const { t } = useTranslation("journals");
  const stableStudents: JournalStudentResponse[] = useStableStudentOrder(journalId, serverOrderedStudents);
  const students: JournalStudentResponse[] = useMemo(() => {
    const filtered: JournalStudentResponse[] = visibleStudentIds
      ? stableStudents.filter((student) => visibleStudentIds.has(student.student_id))
      : stableStudents;
    return JournalStudentOrdering.pinFirst(filtered, readOnlySelfStudentId);
  }, [stableStudents, visibleStudentIds, readOnlySelfStudentId]);
  const effectiveEditing: JournalRowEditing | null = readOnlySelfStudentId === null ? editing : null;
  const [focus, setFocus] = useState<GridFocus | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const headerStripRef = useRef<HTMLDivElement>(null);
  const scrollBarRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const viewport = useJournalGridViewport({ body: regionRef, header: headerStripRef, bar: scrollBarRef });
  const tableWidthPx: number =
    STICKY_STUDENT_COLUMN_PX +
    lessonDates.length * LESSON_COLUMN_PX +
    2 * SUMMARY_FIELD_COLUMN_PX +
    TOTAL_COLUMN_PX;

  const defaultLesson: string | undefined =
    selectedLesson && lessonDates.includes(selectedLesson) ? selectedLesson : lessonDates[0];
  const defaultKey: string | null =
    students.length > 0 && defaultLesson !== undefined ? cellKeyOf(students[0].student_id, defaultLesson) : null;
  const focusIsValid: boolean =
    focus !== null &&
    focus.journalId === journalId &&
    students.some((student) => student.student_id === focus.studentId) &&
    lessonDates.includes(focus.lessonDate);
  const focusedCellKey: string | null =
    focus !== null && focusIsValid ? cellKeyOf(focus.studentId, focus.lessonDate) : defaultKey;
  const focusFromKeyboard: boolean = focusIsValid && focus !== null && focus.fromKeyboard;

  const lastAlignedLesson = useRef<string | undefined>(selectedLesson);

  useEffect(() => {
    if (lastAlignedLesson.current === selectedLesson) return;
    lastAlignedLesson.current = selectedLesson;
    const region: HTMLDivElement | null = regionRef.current;
    const header: HTMLTableCellElement | undefined = selectedLesson ? headerRefs.current.get(selectedLesson) : undefined;
    if (!region || !header) return;
    const regionBounds: DOMRect = region.getBoundingClientRect();
    const headerBounds: DOMRect = header.getBoundingClientRect();
    const leftEdge: number = regionBounds.left + STICKY_STUDENT_COLUMN_PX + VISIBLE_EDGE_PADDING_PX;
    const isOutsideVisibleBand: boolean =
      headerBounds.left < leftEdge || headerBounds.right > regionBounds.right - VISIBLE_EDGE_PADDING_PX;
    if (isOutsideVisibleBand) region.scrollLeft += headerBounds.left - leftEdge;
  }, [selectedLesson]);

  const handleCellFocus = useCallback(
    (key: string, control: JournalCellControl) => {
      const { studentId, lessonDate } = splitCellKey(key);
      setFocus({ journalId, studentId, lessonDate, control, fromKeyboard: false });
      onAnchor?.(studentId, control);
    },
    [journalId, onAnchor],
  );

  const handleCellNavigate = useCallback(
    (key: string, direction: CellNavDirection) => {
      const { studentId, lessonDate } = splitCellKey(key);
      const rowIndex: number = students.findIndex((student) => student.student_id === studentId);
      const columnIndex: number = lessonDates.indexOf(lessonDate);
      if (rowIndex === -1 || columnIndex === -1) return;

      const rowOffset: number = direction === "up" ? -1 : direction === "down" ? 1 : 0;
      const columnOffset: number = direction === "left" ? -1 : direction === "right" ? 1 : 0;
      const nextRow: number = Math.min(Math.max(rowIndex + rowOffset, 0), students.length - 1);
      const nextColumn: number = Math.min(Math.max(columnIndex + columnOffset, 0), lessonDates.length - 1);

      setFocus({
        journalId,
        studentId: students[nextRow].student_id,
        lessonDate: lessonDates[nextColumn],
        control: "cell",
        fromKeyboard: true,
      });
    },
    [students, lessonDates, journalId],
  );

  const today: string = getSchoolCalendarDate();
  const atRiskStudentIds: Set<number> = useMemo(
    () =>
      new Set(
        students.filter((student) => JournalAtRiskRules.isAtRisk(student, lessonDates, today)).map((student) => student.student_id),
      ),
    [students, lessonDates, today],
  );

  const fillColumn = useCallback(
    (kind: JournalBulkFillKind, lessonDate: string): void => {
      if (!effectiveEditing) return;
      JournalBulkFill.targetsFor(kind, students, lessonDate).forEach((target) =>
        effectiveEditing.onEntryCommand(target.studentId, lessonDate, target.command),
      );
    },
    [effectiveEditing, students],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div
          ref={headerStripRef}
          data-testid="journal-grid-header"
          style={{ top: SHELL_HEADER_OFFSET }}
          className="sticky z-20 overflow-hidden rounded-t-2xl border border-b-0 border-border bg-beige"
        >
          <table style={{ width: tableWidthPx, minWidth: "100%", tableLayout: "fixed" }} className="border-separate border-spacing-0 text-sm">
            <colgroup>
              <col style={{ width: STICKY_STUDENT_COLUMN_PX }} />
              {lessonDates.map((date) => (
                <col key={date} style={{ width: LESSON_COLUMN_PX }} />
              ))}
              <col style={{ width: SUMMARY_FIELD_COLUMN_PX }} />
              <col style={{ width: SUMMARY_FIELD_COLUMN_PX }} />
              <col style={{ width: TOTAL_COLUMN_PX }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-30 border-b border-r border-border bg-beige bg-clip-padding px-4 py-3 shadow-[1px_0_0_0_var(--color-border)] text-left text-sm font-semibold text-ink"
                >
                  {t("table.students")}
                </th>

                {lessonDates.map((date) => (
                  <th
                    key={date}
                    ref={(element) => {
                      if (element) headerRefs.current.set(date, element);
                      else headerRefs.current.delete(date);
                    }}
                    scope="col"
                    aria-current={date === selectedLesson ? "date" : undefined}
                    className={`relative border-b border-border p-0 text-center motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${
                      date === selectedLesson ? "bg-info-surface text-ink" : "bg-beige text-ink"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectLesson(date)}
                      className="flex min-h-14 w-full flex-col items-center justify-center px-2 py-1 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="text-xs text-muted">{formatSchoolLessonWeekday(date)}</span>
                      <span className="text-sm font-semibold tabular-nums">{formatSchoolLessonDate(date)}</span>
                    </button>
                    {effectiveEditing && (
                      <JournalLessonColumnMenu
                        formattedDate={formatSchoolLessonDate(date)}
                        onFill={(kind) => fillColumn(kind, date)}
                      />
                    )}
                  </th>
                ))}

                <th scope="col" className="border-b border-l border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  {t("table.exam")}
                </th>

                <th scope="col" className="border-b border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  {t("table.bonus")}
                </th>

                <th scope="col" className="border-b border-l border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  {t("table.sum")}
                </th>
              </tr>
            </thead>
          </table>
        </div>

        <div
          ref={regionRef}
          role="region"
          tabIndex={0}
          aria-label={t("grid.regionLabel", { period: periodLabel })}
          data-testid="journal-grid-region"
          className={`w-full overflow-x-auto overflow-y-hidden overscroll-x-contain border-x border-border bg-card [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden ${
            viewport.overflows ? "" : "rounded-b-2xl border-b"
          }`}
        >
          <table style={{ width: tableWidthPx, minWidth: "100%", tableLayout: "fixed" }} className="border-separate border-spacing-0 text-sm">
            <colgroup>
              <col style={{ width: STICKY_STUDENT_COLUMN_PX }} />
              {lessonDates.map((date) => (
                <col key={date} style={{ width: LESSON_COLUMN_PX }} />
              ))}
              <col style={{ width: SUMMARY_FIELD_COLUMN_PX }} />
              <col style={{ width: SUMMARY_FIELD_COLUMN_PX }} />
              <col style={{ width: TOTAL_COLUMN_PX }} />
            </colgroup>
            <tbody>
              {students.map((student) => (
                <JournalStudentRow
                  key={student.student_id}
                  student={student}
                  lessonDates={lessonDates}
                  selectedLesson={selectedLesson}
                  cellStatus={cellStatus}
                  summaryStatus={summaryStatus.get(student.student_id)}
                  focusedCellKey={focusedCellKey}
                  focusFromKeyboard={focusFromKeyboard}
                  editing={effectiveEditing}
                  examMaximum={examMaximum}
                  bonusMaximum={bonusMaximum}
                  atRisk={atRiskStudentIds.has(student.student_id)}
                  isSelf={readOnlySelfStudentId !== null && student.student_id === readOnlySelfStudentId}
                  markUnrecorded={readOnlySelfStudentId !== null}
                  onCellFocus={handleCellFocus}
                  onCellNavigate={handleCellNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div
          ref={scrollBarRef}
          data-testid="journal-grid-scrollbar"
          aria-hidden="true"
          className={`sticky bottom-0 z-20 h-[14px] overflow-x-scroll overflow-y-hidden rounded-b-2xl [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-control-border [&::-webkit-scrollbar-track]:bg-strip border border-t-0 border-border bg-card ${viewport.overflows ? "" : "hidden"}`}
        >
          <div style={{ width: tableWidthPx, height: 1 }} />
        </div>
        {viewport.canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-px top-14 w-10 bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
    </div>
  );
};
