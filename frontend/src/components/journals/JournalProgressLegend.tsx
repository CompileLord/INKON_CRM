import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { JournalProgressRules, type ProgressChartStudent } from "../../lib/journals/JournalProgressRules";
import { AverageSwatch, MaximumSwatch, StudentSwatch } from "./JournalProgressChart";

interface MoreStudentsMenuProps {
  students: ProgressChartStudent[];
  hiddenCount: number;
  visibleIds: Set<number>;
  onToggle: (studentId: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  showBulkActions: boolean;
  chipClassName: string;
}

const MoreStudentsMenu: React.FC<MoreStudentsMenuProps> = ({
  students,
  hiddenCount,
  visibleIds,
  onToggle,
  onShowAll,
  onHideAll,
  showBulkActions,
  chipClassName,
}) => {
  const { t } = useTranslation("journals");
  const [open, setOpen] = useState<boolean>(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: PointerEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const firstSelectedIndex: number = Math.max(students.findIndex((student) => visibleIds.has(student.studentId)), 0);

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveFocus = (from: number, delta: number): void => {
    const next: number = Math.min(Math.max(from + delta, 0), students.length - 1);
    optionRefs.current[next]?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={chipClassName}
        data-testid="legend-more"
      >
        {hiddenCount > 0 ? t("progress.moreCount", { count: hiddenCount }) : t("progress.moreList")}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 flex w-[min(18rem,calc(100vw-2rem))] origin-top-right flex-col rounded-[12px] bg-card p-2 shadow-lg ring-1 ring-border motion-safe:animate-[card-scale-in_150ms_cubic-bezier(0.16,1,0.3,1)]"
          data-testid="legend-more-popover"
        >
          {showBulkActions && (
            <div className="mb-1 flex gap-1 border-b border-border pb-1">
              <button type="button" onClick={onShowAll} className="min-h-11 rounded-[8px] px-2 text-sm font-semibold text-maroon-text hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent lg:min-h-9">
                {t("progress.showAll")}
              </button>
              <button type="button" onClick={onHideAll} className="min-h-11 rounded-[8px] px-2 text-sm font-semibold text-maroon-text hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-accent lg:min-h-9">
                {t("progress.hideAll")}
              </button>
            </div>
          )}
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={t("progress.moreListLabel")}
            className="flex max-h-64 flex-col overflow-y-auto overscroll-contain"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
          >
            {students.map((student, index) => {
              const selected: boolean = visibleIds.has(student.studentId);
              return (
                <button
                  key={student.studentId}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  autoFocus={index === firstSelectedIndex}
                  onClick={() => onToggle(student.studentId)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveFocus(index, 1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveFocus(index, -1);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      moveFocus(0, 0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      moveFocus(students.length - 1, 0);
                    }
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-[8px] px-2 text-left text-sm text-ink hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
                >
                  <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${selected ? "border-ink bg-ink text-card" : "border-control-border"}`}>
                    {selected && <Check size={12} strokeWidth={3} />}
                  </span>
                  <StudentSwatch student={student} muted={!selected} />
                  <span className="min-w-0 flex-1 truncate" title={student.name}>{student.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const chipClass = (pressed: boolean): string =>
  `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9 motion-safe:transition-colors motion-safe:duration-150 ${
    pressed ? "border-border bg-card text-ink" : "border-transparent bg-transparent text-muted"
  }`;

interface JournalProgressLegendProps {
  students: ProgressChartStudent[];
  visibleIds: Set<number>;
  selfStudentId: number | null;
  showAverage: boolean;
  showMaximum: boolean;
  onToggleAverage: () => void;
  onToggleMaximum: () => void;
  onToggleStudent: (studentId: number) => void;
  onVisibleChange: (visible: Set<number>) => void;
}

export const JournalProgressLegend: React.FC<JournalProgressLegendProps> = ({
  students,
  visibleIds,
  selfStudentId,
  showAverage,
  showMaximum,
  onToggleAverage,
  onToggleMaximum,
  onToggleStudent,
  onVisibleChange,
}) => {
  const { t } = useTranslation("journals");
  const manyStudents: boolean = students.length > JournalProgressRules.TOGGLE_ALL_THRESHOLD;
  const plottedStudents: ProgressChartStudent[] = JournalProgressRules.pinFirst(
    students.filter((student) => visibleIds.has(student.studentId)),
    selfStudentId,
  );
  const hiddenStudents: ProgressChartStudent[] = students.filter((student) => !visibleIds.has(student.studentId));
  const youBadge = (student: ProgressChartStudent) =>
    student.studentId === selfStudentId ? (
      <span className="rounded-full bg-info-surface px-2 text-xs font-semibold text-ink">{t("readOnly.you")}</span>
    ) : null;

  return (
    <div className="relative flex min-w-0 items-center gap-1" data-testid="progress-legend">
      <ul className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain lg:flex-wrap lg:overflow-visible" aria-label={t("progress.legendLabel")}>
        <li className="shrink-0">
          <button type="button" aria-pressed={showAverage} onClick={onToggleAverage} className={chipClass(showAverage)}>
            <AverageSwatch />
            {t("progress.classAverage")}
          </button>
        </li>
        <li className="shrink-0">
          <button type="button" aria-pressed={showMaximum} onClick={onToggleMaximum} className={chipClass(showMaximum)} data-testid="legend-maximum">
            <MaximumSwatch />
            {t("progress.maximum")}
          </button>
        </li>
        {plottedStudents.map((student) => (
          <li key={student.studentId} className="shrink-0">
            <button type="button" aria-pressed onClick={() => onToggleStudent(student.studentId)} className={chipClass(true)}>
              <StudentSwatch student={student} />
              {student.name}
              {youBadge(student)}
            </button>
          </li>
        ))}
      </ul>
      {(hiddenStudents.length > 0 || manyStudents) && (
        <MoreStudentsMenu
          students={JournalProgressRules.pinFirst(students, selfStudentId)}
          hiddenCount={hiddenStudents.length}
          visibleIds={visibleIds}
          onToggle={onToggleStudent}
          onShowAll={() => onVisibleChange(new Set(students.map((student) => student.studentId)))}
          onHideAll={() => onVisibleChange(new Set())}
          showBulkActions={manyStudents}
          chipClassName={chipClass(true)}
        />
      )}
    </div>
  );
};
