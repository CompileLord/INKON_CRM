import { useId, useState, type FormEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { useTranslation } from "react-i18next";
import { PeriodLabel } from "../../lib/finance/periodLabel";
import { FinanceUrlState, type CollectionRange, type RangePreset, type RangeProblem } from "../../lib/finance/urlState";
import { Button } from "../ui/Button";
import { DatePicker } from "../ui/DatePicker";

const PRESETS: readonly RangePreset[] = ["thisMonth", "lastMonth", "thisYear"];

interface CollectionRangePickerProps {
  range: CollectionRange;
  onApply: (range: CollectionRange) => void;
}

export function CollectionRangePicker({ range, onApply }: CollectionRangePickerProps) {
  const { t, i18n } = useTranslation("finance");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-label={t("overview.rangeButton", { period: PeriodLabel.compact(range, i18n.language) })}
        className="inline-flex min-h-11 items-center whitespace-nowrap rounded-[10px] border border-control-border bg-card px-3 text-sm text-ink tabular-nums hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        {PeriodLabel.compact(range, i18n.language)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={16} className="z-70">
          <Popover.Popup className="w-[min(22rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 shadow-lg focus-visible:outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0">
            <Popover.Title className="text-sm font-semibold text-ink">{t("overview.rangeTitle")}</Popover.Title>
            <CollectionRangeForm
              key={range.from + "|" + range.to}
              initial={range}
              onApply={(next: CollectionRange) => {
                onApply(next);
                setIsOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface CollectionRangeFormProps {
  initial: CollectionRange;
  onApply: (range: CollectionRange) => void;
}

function CollectionRangeForm({ initial, onApply }: CollectionRangeFormProps) {
  const { t } = useTranslation("finance");
  const rangeId: string = useId();
  const [draftFrom, setDraftFrom] = useState<string>(initial.from);
  const [draftTo, setDraftTo] = useState<string>(initial.to);
  const [problem, setProblem] = useState<RangeProblem | null>(null);
  const problemKey: string | null = problem ? `overview.range${problem[0].toUpperCase()}${problem.slice(1)}` : null;
  const problemId: string = `${rangeId}-problem`;

  const submitRange = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const detected: RangeProblem | null = FinanceUrlState.rangeProblem(draftFrom, draftTo);
    setProblem(detected);
    if (detected === null) onApply({ from: draftFrom, to: draftTo });
  };

  return (
    <>
      <div role="group" aria-label={t("overview.presets")} className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset: RangePreset) => (
          <Button key={preset} variant="secondary" className="px-3" onClick={() => onApply(FinanceUrlState.presetRange(preset))}>
            {t(`overview.preset${preset[0].toUpperCase()}${preset.slice(1)}`)}
          </Button>
        ))}
      </div>
      <form onSubmit={submitRange} noValidate className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${rangeId}-from`} className="text-sm font-medium text-ink">{t("overview.rangeFrom")}</label>
          <div className="mt-1">
            <DatePicker id={`${rangeId}-from`} label={t("overview.rangeFrom")} value={draftFrom} onChange={setDraftFrom} invalid={problem !== null} describedBy={problem ? problemId : undefined} />
          </div>
        </div>
        <div>
          <label htmlFor={`${rangeId}-to`} className="text-sm font-medium text-ink">{t("overview.rangeTo")}</label>
          <div className="mt-1">
            <DatePicker id={`${rangeId}-to`} label={t("overview.rangeTo")} value={draftTo} onChange={setDraftTo} invalid={problem !== null} describedBy={problem ? problemId : undefined} />
          </div>
        </div>
        {problemKey && <p id={problemId} role="alert" className="col-span-2 text-sm text-destructive">{t(problemKey)}</p>}
        <Button type="submit" variant="secondary" className="col-span-2">{t("overview.applyRange")}</Button>
      </form>
    </>
  );
}
