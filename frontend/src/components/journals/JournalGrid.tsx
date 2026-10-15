import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsRight } from "lucide-react";
import { JournalStudentRow, type JournalRowEditing } from "./JournalStudentRow";
import { useJournalGridViewport } from "./useJournalGridViewport";
import type { CellNavDirection, JournalCellControl } from "./JournalScoreCell";
import { formatSchoolLessonDate, formatSchoolLessonWeekday } from "../../i18n/formatters";
import { useStableStudentOrder } from "../../lib/journals/JournalStudentOrdering";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalGridProps {
  journalId: number;
  periodLabel: string;
  students: JournalStudentResponse[];
  lessonDates: string[];
  selectedLesson: string | undefined;
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  summaryStatus: Map<number, CellSaveStatus>;
  editing: JournalRowEditing | null;
  onSelectLesson: (lessonDate: string) => void;
  visibleStudentIds?: Set<number> | null;
  onAnchor?: (studentId: number, control: string) => void;
}

interface GridFocus {
  journalId: number;
  studentId: number;
  lessonDate: string;
  control: JournalCellControl;
  fromKeyboard: boolean;
}

const STICKY_STUDENT_COLUMN_PX = 200;
const VISIBLE_EDGE_PADDING_PX = 8;

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
  examMaxScore,
  cellStatus,
  summaryStatus,
  editing,
  onSelectLesson,
  visibleStudentIds = null,
  onAnchor,
}) => {
  const { t } = useTranslation("journals");
  const stableStudents: JournalStudentResponse[] = useStableStudentOrder(journalId, serverOrderedStudents);
  const students: JournalStudentResponse[] = visibleStudentIds
    ? stableStudents.filter((student) => visibleStudentIds.has(student.student_id))
    : stableStudents;
  const [focus, setFocus] = useState<GridFocus | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
  const viewport = useJournalGridViewport(regionRef);

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

  useEffect(() => {
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

  const showScrollCue: boolean = viewport.canScrollLeft || viewport.canScrollRight;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-6 items-center justify-end">
        {showScrollCue && (
          <p className="flex items-center gap-1.5 text-sm text-muted" data-testid="journal-scroll-cue">
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            {t("grid.scrollHint")}
          </p>
        )}
      </div>

      <div className="relative">
        <div
          ref={regionRef}
          role="region"
          tabIndex={0}
          aria-label={t("grid.regionLabel", { period: periodLabel })}
          data-testid="journal-grid-region"
          style={{ maxHeight: viewport.maxHeightPx ?? "max(24rem, calc(100dvh - 22rem))" }}
          className="w-full overflow-auto overscroll-x-contain rounded-2xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 w-[200px] min-w-[200px] border-b border-r border-border bg-beige px-4 py-3 text-left text-sm font-semibold text-ink"
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
                    className={`sticky top-0 z-20 min-w-[160px] border-b border-border p-0 text-center ${
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
                  </th>
                ))}

                <th scope="col" className="sticky top-0 z-20 min-w-[88px] border-b border-l border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  {t("table.bonus")}
                </th>

                <th scope="col" className="sticky top-0 z-20 min-w-[88px] border-b border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  <span className="block">{t("table.exam")}</span>
                  <span className="block text-xs font-normal text-muted tabular-nums">{t("table.maxN", { n: examMaxScore })}</span>
                </th>

                <th scope="col" className="sticky top-0 z-20 min-w-[80px] border-b border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  {t("table.sum")}
                </th>

                <th scope="col" className="sticky top-0 z-20 min-w-[80px] border-b border-border bg-beige px-2 py-3 text-center text-sm font-semibold text-ink">
                  %
                </th>
              </tr>
            </thead>

            <tbody>
              {students.map((student) => (
                <JournalStudentRow
                  key={student.student_id}
                  student={student}
                  lessonDates={lessonDates}
                  selectedLesson={selectedLesson}
                  examMaxScore={examMaxScore}
                  cellStatus={cellStatus}
                  summaryStatus={summaryStatus.get(student.student_id)}
                  focusedCellKey={focusedCellKey}
                  focusFromKeyboard={focusFromKeyboard}
                  editing={editing}
                  onCellFocus={handleCellFocus}
                  onCellNavigate={handleCellNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>
        {viewport.canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-2xl bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
    </div>
  );
};
