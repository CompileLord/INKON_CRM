import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings, AlertCircle, X } from "lucide-react";
import { JournalStudentRow } from "./JournalStudentRow";
import type { CellNavDirection } from "./JournalScoreCell";
import type { CellSaveStatus, JournalAutosaveConflict } from "../../lib/journals/useJournalAutosave";
import type { JournalStudentResponse } from "../../lib/journals/types";

interface JournalGridProps {
  students: JournalStudentResponse[];
  lessonDates: string[];
  periodType: "week" | "month";
  examMaxScore: number;
  cellStatus: Map<string, CellSaveStatus>;
  conflicts: JournalAutosaveConflict[];
  onResolveConflict: (conflict: JournalAutosaveConflict, choice: "keepMine" | "keepTheirs") => void;
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
  const [activeColDate, setActiveColDate] = useState<string | null>(
    lessonDates.length > 0 ? lessonDates[0] : null
  );
  const [focusFromKeyboard, setFocusFromKeyboard] = useState(false);
  const tableWrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth;
      if (maxScrollLeft <= 0) return;

      const deltaY = e.deltaY;
      const deltaX = e.deltaX;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        return;
      }

      if (deltaY !== 0) {
        if (deltaY > 0 && el.scrollLeft < maxScrollLeft - 1) {
          e.preventDefault();
          el.scrollLeft += deltaY;
        } else if (deltaY < 0 && el.scrollLeft > 1) {
          e.preventDefault();
          el.scrollLeft += deltaY;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleCellFocus = useCallback((key: string) => {
    setFocusedCellKey(key);
    setFocusFromKeyboard(false);
    const date = key.split(":")[1];
    if (date) setActiveColDate(date);
  }, []);

  const handleCellNavigate = useCallback(
    (key: string, direction: CellNavDirection) => {
      const [studentIdRaw, ...dateParts] = key.split(":");
      const studentId = Number(studentIdRaw);
      const date = dateParts.join(":");

      const rowIndex = students.findIndex((s) => s.student_id === studentId);
      const colIndex = lessonDates.indexOf(date);
      if (rowIndex === -1 || colIndex === -1) return;

      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (direction === "up") nextRow -= 1;
      else if (direction === "down") nextRow += 1;
      else if (direction === "left") nextCol -= 1;
      else nextCol += 1;

      if (nextCol < 0) {
        if (nextRow === 0) return;
        nextRow -= 1;
        nextCol = lessonDates.length - 1;
      } else if (nextCol > lessonDates.length - 1) {
        if (nextRow === students.length - 1) return;
        nextRow += 1;
        nextCol = 0;
      }

      if (nextRow < 0 || nextRow > students.length - 1) return;

      const nextDate = lessonDates[nextCol];
      setFocusedCellKey(`${students[nextRow].student_id}:${nextDate}`);
      setActiveColDate(nextDate);
      setFocusFromKeyboard(true);
    },
    [students, lessonDates]
  );

  return (
    <div className="space-y-3">
      {conflicts.length > 0 && (
        <div className="space-y-2" role="alert">
          {conflicts.map((conflict) => {
            const student = students.find((s) => s.student_id === conflict.student_id);
            const name = student
              ? `${student.first_name} ${student.last_name}`
              : t("conflict.studentFallback", { id: conflict.student_id });
            const key =
              conflict.type === "summary"
                ? `${conflict.student_id}:summary`
                : `${conflict.student_id}:${conflict.lesson_date}`;
            const targetLabel =
              conflict.type === "summary"
                ? t("conflict.pairedSummary")
                : conflict.lesson_date;
            const isUnavailable = conflict.current === null;
            const isUnknown = conflict.current === undefined;

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-destructive bg-danger-surface text-destructive"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                  <div className="text-xs break-words">
                    <span className="font-semibold">{t("conflict.title")}</span>: {name} ({targetLabel}) —{" "}
                    {isUnavailable ? t("conflict.unavailable") : isUnknown ? t("conflict.unrefreshed") : t("conflict.body")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={isUnavailable || isUnknown}
                    onClick={() => onResolveConflict(conflict, "keepMine")}
                    className={`min-h-[44px] min-w-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center justify-center motion-safe:transition-all motion-safe:duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isUnavailable || isUnknown
                        ? "opacity-40 cursor-not-allowed pointer-events-none bg-muted text-card"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    }`}
                  >
                    {t("conflict.keepMine")}
                  </button>
                  <button
                    type="button"
                    disabled={isUnknown}
                    onClick={() => onResolveConflict(conflict, "keepTheirs")}
                    className={`min-h-[44px] min-w-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border border-destructive/40 bg-danger-surface text-destructive motion-safe:transition-all motion-safe:duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isUnknown
                        ? "opacity-40 cursor-not-allowed pointer-events-none"
                        : "hover:bg-destructive/10"
                    }`}
                  >
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span>{isUnavailable ? t("conflict.discard") : t("conflict.keepTheirs")}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div ref={tableWrapperRef} className="w-full overflow-x-auto border border-border rounded-xl bg-card shadow-sm">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-beige border-b border-border text-muted font-semibold">
              <th scope="col" className="sticky left-0 z-20 bg-beige px-4 py-3 text-left border-r border-border min-w-[160px]">
                {t("table.students")}
              </th>

              {lessonDates.map((date) => {
                const dateObj = new Date(date);
                const dateFormatted = `${dateObj.getDate().toString().padStart(2, "0")}.${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
                return (
                  <th
                    key={date}
                    scope="col"
                    onMouseEnter={() => setActiveColDate(date)}
                    className={`px-2 py-3 text-center min-w-[70px] transition-colors cursor-pointer ${
                      activeColDate === date ? "bg-maroon/10 dark:bg-accent/10 text-ink" : ""
                    }`}
                  >
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
                    className="text-muted hover:text-ink p-0.5 rounded transition-colors"
                    title={t("table.editExamWeight")}
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </div>
                <span className="block text-[10px] font-normal text-muted">
                  {t("table.maxN", { n: examMaxScore })}
                </span>
              </th>

              <th scope="col" className="sticky right-16 z-20 w-16 min-w-16 bg-beige border-l border-border px-3 py-3 text-center">
                {t("table.sum")}
              </th>

              <th scope="col" className="sticky right-0 z-20 w-16 min-w-16 bg-beige px-3 py-3 text-center">
                %
              </th>
            </tr>
          </thead>

          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={lessonDates.length + 5} className="px-4 py-8 text-center text-muted">
                  {t("table.noStudentsInCourse")}
                </td>
              </tr>
            ) : (
              students.map((student, index) => (
                <JournalStudentRow
                  key={student.student_id}
                  student={student}
                  lessonDates={lessonDates}
                  periodType={periodType}
                  examMaxScore={examMaxScore}
                  cellStatus={cellStatus}
                  focusedCellKey={focusedCellKey}
                  focusFromKeyboard={focusFromKeyboard}
                  activeColDate={activeColDate}
                  animationIndex={index}
                  onCellFocus={handleCellFocus}
                  onCellNavigate={handleCellNavigate}
                  onEntryChange={onEntryChange}
                  onSummaryChange={onSummaryChange}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted italic px-1">
        {t("table.gridHelp")}
      </p>
    </div>
  );
};
