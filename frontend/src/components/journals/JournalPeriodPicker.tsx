import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { JournalWorkspaceSelection, type PeriodTiming } from "../../lib/journals/JournalWorkspaceSelection";
import type { JournalPeriod } from "../../lib/courses/types";

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

  const rangeOf = (period: JournalPeriod): string =>
    t("period.range", {
      start: formatSchoolLessonDate(period.period_start),
      end: formatSchoolLessonDate(period.period_end),
    });

  const timingLabelOf = (period: JournalPeriod): string => {
    const timing: PeriodTiming = JournalWorkspaceSelection.timingOf(period, ordered, today);
    return t(TIMING_LABEL_KEYS[timing]);
  };

  const selectedTiming: string = timingLabelOf(selected);

  return (
    <div className="relative min-h-[56px] w-full min-w-0 rounded-[10px] border border-control-border bg-card focus-within:ring-2 focus-within:ring-ring lg:w-auto lg:min-w-[240px] lg:max-w-[420px]">
      <div className="pointer-events-none flex min-h-[54px] items-center justify-between gap-3 px-3 py-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words text-sm font-semibold text-ink">{selected.period_label}</span>
            <span className="rounded-full border border-info/30 bg-info-surface px-2 py-0.5 text-xs font-semibold text-info">
              {selectedTiming}
            </span>
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted">{rangeOf(selected)}</div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </div>
      <select
        aria-label={t("workspace.periodPickerLabel")}
        value={selected.id}
        disabled={disabled}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {ordered.map((period) => {
          const label: string = [period.period_label, rangeOf(period), timingLabelOf(period)].join(" · ");
          return (
            <option key={period.id} value={period.id}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
};
