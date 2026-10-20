import React from "react";
import { useTranslation } from "react-i18next";
import { formatSchoolLessonDate } from "../../i18n/formatters";
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
}

const TIMING_LABEL_KEYS: Partial<Record<PeriodTiming, string>> = {
  current: "period.current",
  latest: "period.latest",
  upcoming: "period.upcoming",
};

export const JournalPeriodSelect: React.FC<JournalPeriodSelectProps> = ({ periods, selectedPeriodId, today, onSelect, disabled = false }) => {
  const { t } = useTranslation("journals");
  const periodName: (label: string) => string = usePeriodName();
  const ordered: JournalPeriod[] = JournalWorkspaceSelection.orderPeriods(periods);
  const selected: JournalPeriod = ordered.find((period) => period.id === selectedPeriodId) ?? ordered[0];

  const options: ListboxOption[] = ordered.map((period: JournalPeriod): ListboxOption => {
    const timingKey: string | undefined = TIMING_LABEL_KEYS[JournalWorkspaceSelection.timingOf(period, ordered, today)];
    const range: string = t("period.range", { start: formatSchoolLessonDate(period.period_start), end: formatSchoolLessonDate(period.period_end) });
    const parts: string[] = [periodName(period.period_label), range, ...(timingKey ? [t(timingKey)] : [])];
    return { value: String(period.id), label: parts.join(" · "), muted: timingKey === "period.upcoming" };
  });

  return (
    <div className="w-full sm:w-[28rem]" data-testid="journal-period-select">
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
