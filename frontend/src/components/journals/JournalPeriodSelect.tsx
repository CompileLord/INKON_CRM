import React from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, CircleCheck, CircleDot, Clock, type LucideIcon } from "lucide-react";
import { formatSchoolLessonDate, formatSchoolPeriodSpan } from "../../i18n/formatters";
import { JournalWorkspaceSelection, type PeriodTiming } from "../../lib/journals/JournalWorkspaceSelection";
import type { JournalPeriod } from "../../lib/courses/types";
import { usePeriodName } from "../ui/periodName";
import { Select } from "../ui/Select";
import type { ListboxOption } from "../ui/ListboxPicker";

interface JournalPeriodSelectProps {
  periods: JournalPeriod[];
  selectedPeriodId: number;
  today: string;
  onSelect: (periodId: number) => void;
  disabled?: boolean;
  showPastStatus?: boolean;
}

const TIMING_LABEL_KEYS: Partial<Record<PeriodTiming, string>> = {
  current: "period.current",
  latest: "period.latest",
  upcoming: "period.upcoming",
};

const TIMING_ICONS: Record<PeriodTiming, { Icon: LucideIcon; tone: string }> = {
  current: { Icon: CircleDot, tone: "text-maroon-text" },
  latest: { Icon: Clock, tone: "text-info" },
  upcoming: { Icon: CalendarClock, tone: "text-muted" },
  past: { Icon: CircleCheck, tone: "text-success" },
};

const PAST_AWARE_LABEL_KEYS: Partial<Record<PeriodTiming, string>> = { ...TIMING_LABEL_KEYS, latest: "period.past", past: "period.past" };

export const JournalPeriodSelect: React.FC<JournalPeriodSelectProps> = ({ periods, selectedPeriodId, today, onSelect, disabled = false, showPastStatus = false }) => {
  const { t } = useTranslation("journals");
  const periodName: (label: string) => string = usePeriodName();
  const ordered: JournalPeriod[] = JournalWorkspaceSelection.orderPeriods(periods);
  const selected: JournalPeriod = ordered.find((period) => period.id === selectedPeriodId) ?? ordered[0];

  const options: ListboxOption[] = ordered.map((period: JournalPeriod): ListboxOption => {
    const timing: PeriodTiming = JournalWorkspaceSelection.timingOf(period, ordered, today);
    const timingKey: string | undefined = (showPastStatus ? PAST_AWARE_LABEL_KEYS : TIMING_LABEL_KEYS)[timing];
    const { Icon, tone } = TIMING_ICONS[timing];
    return {
      value: String(period.id),
      label: periodName(period.period_label),
      detail: formatSchoolPeriodSpan(period.period_start, period.period_end),
      title: t("period.range", { start: formatSchoolLessonDate(period.period_start), end: formatSchoolLessonDate(period.period_end) }),
      muted: timingKey === "period.upcoming",
      status: timingKey ? { icon: <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />, label: t(timingKey) } : undefined,
    };
  });

  return (
    <div className="w-full sm:w-64" data-testid="journal-period-select">
      <Select
        label={t("workspace.periodPickerLabel")}
        options={options}
        value={String(selected.id)}
        disabled={disabled}
        onChange={(value: string) => {
          if (Number(value) !== selected.id) onSelect(Number(value));
        }}
      />
    </div>
  );
};
