import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { JournalWorkspaceSelection, type PeriodTiming } from "../../lib/journals/JournalWorkspaceSelection";
import type { JournalPeriod } from "../../lib/courses/types";
import { JournalMotion } from "../../lib/journals/JournalMotion";

interface JournalPeriodPickerProps {
  periods: JournalPeriod[];
  selectedPeriodId: number;
  today: string;
  onSelect: (periodId: number) => void;
  disabled?: boolean;
}

const TIMING_LABEL_KEYS: Record<PeriodTiming, string> = {
  past: "period.past",
  current: "period.current",
  latest: "period.latest",
  upcoming: "period.upcoming",
};

const TYPEAHEAD_RESET_MILLISECONDS = 700;

export const JournalPeriodPicker: React.FC<JournalPeriodPickerProps> = ({
  periods,
  selectedPeriodId,
  today,
  onSelect,
  disabled = false,
}) => {
  const { t } = useTranslation("journals");
  const ordered: JournalPeriod[] = JournalWorkspaceSelection.orderPeriods(periods);
  const selected: JournalPeriod = ordered.find((period) => period.id === selectedPeriodId) ?? ordered[0];
  const selectedIndex: number = ordered.indexOf(selected);
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(selectedIndex);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({ buffer: "", timer: null });
  const baseId: string = useId();
  const optionId = useCallback((index: number): string => `${baseId}-option-${index}`, [baseId]);

  const rangeOf = (period: JournalPeriod): string =>
    t("period.range", {
      start: formatSchoolLessonDate(period.period_start),
      end: formatSchoolLessonDate(period.period_end),
    });
  const timingLabelOf = (period: JournalPeriod): string =>
    t(TIMING_LABEL_KEYS[JournalWorkspaceSelection.timingOf(period, ordered, today)]);

  const openList = (): void => {
    if (disabled) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const closeList = useCallback((returnFocus: boolean): void => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const choose = (index: number): void => {
    const period: JournalPeriod = ordered[index];
    closeList(true);
    if (period.id !== selected.id) onSelect(period.id);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const node: HTMLDivElement | null = listRef.current;
    node?.focus();
    JournalMotion.popIn(node, "top center");
    return () => JournalMotion.exitGhost(node);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event: PointerEvent): void => {
      const target: Node = event.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeNode: HTMLElement | null = document.getElementById(optionId(activeIndex));
    if (typeof activeNode?.scrollIntoView === "function") activeNode.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, optionId]);

  const typeahead = (character: string): void => {
    const state = typeaheadRef.current;
    if (state.timer) clearTimeout(state.timer);
    state.buffer += character.toLocaleLowerCase();
    state.timer = setTimeout(() => {
      state.buffer = "";
    }, TYPEAHEAD_RESET_MILLISECONDS);
    const matches = (period: JournalPeriod): boolean => period.period_label.toLocaleLowerCase().startsWith(state.buffer);
    const fromCurrent: number = ordered.findIndex((period, index) => index > activeIndex && matches(period));
    const found: number = state.buffer.length > 1 ? ordered.findIndex(matches) : fromCurrent === -1 ? ordered.findIndex(matches) : fromCurrent;
    if (found !== -1) setActiveIndex(found);
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const lastIndex: number = ordered.length - 1;
    if (event.key === "ArrowDown") setActiveIndex((index) => Math.min(index + 1, lastIndex));
    else if (event.key === "ArrowUp") setActiveIndex((index) => Math.max(index - 1, 0));
    else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(lastIndex);
    else if (event.key === "Enter" || event.key === " ") choose(activeIndex);
    else if (event.key === "Escape") closeList(true);
    else if (event.key === "Tab") closeList(false);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
    else return;
    event.preventDefault();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList();
    }
  };

  return (
    <div className="relative min-w-0 w-40 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={t("workspace.periodPickerLabel")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border border-control-border bg-card px-3 text-left hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-11 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{selected.period_label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${baseId}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={t("workspace.periodPickerLabel")}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 top-full z-40 mt-1 max-h-[min(24rem,60vh)] w-full min-w-[22rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-lg focus-visible:outline-none"
        >
          {ordered.map((period, index) => {
            const isSelected: boolean = period.id === selected.id;
            return (
              <div
                key={period.id}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(index)}
                onPointerMove={() => setActiveIndex(index)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2 py-1.5 ${
                  index === activeIndex ? "bg-row-hover" : ""
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-maroon-text">
                  {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-ink">{period.period_label}</span>
                  <span className="block text-xs tabular-nums text-muted">
                    {rangeOf(period)} · {timingLabelOf(period)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
