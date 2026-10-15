import { useId, useState, type FormEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { FinanceUrlState, type RangePreset, type RangeProblem } from "../../lib/finance/urlState";
import type { PaymentDayRange } from "../../lib/finance/paymentDateBounds";
import { Button } from "../ui/Button";

interface PaymentDateRangePickerProps {
  range: PaymentDayRange;
  onApply: (range: PaymentDayRange) => void;
}

const PRESETS: readonly RangePreset[] = ["thisMonth", "lastMonth", "thisYear"];
const INPUT_CLASSES: string =
  "mt-1 min-h-12 w-full min-w-0 rounded-[10px] border border-control-border bg-card px-3 py-2 text-base text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PaymentDateRangePicker({ range, onApply }: PaymentDateRangePickerProps) {
  const { t, i18n } = useTranslation("finance");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const language: string = i18n.language;
  const summary: string =
    range.from && range.to
      ? `${formatDate(range.from, language, SCHOOL_TIMEZONE)} – ${formatDate(range.to, language, SCHOOL_TIMEZONE)}`
      : range.from
        ? t("paymentsTab.dateFromOnly", { date: formatDate(range.from, language, SCHOOL_TIMEZONE) })
        : range.to
          ? t("paymentsTab.dateToOnly", { date: formatDate(range.to, language, SCHOOL_TIMEZONE) })
          : t("paymentsTab.scope");
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-control-border bg-card px-3 text-sm text-ink hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
      >
        <CalendarDays size={16} aria-hidden="true" className="text-muted" />
        <span className="text-label">{t("paymentsTab.dateLabel")}</span>
        <span className="font-medium tabular-nums">{summary}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup className="w-[min(22rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]">
            <Popover.Title className="text-sm font-semibold text-ink">{t("paymentsTab.dateTitle")}</Popover.Title>
            <PaymentDateRangeForm
              key={`${range.from ?? ""}|${range.to ?? ""}`}
              initial={range}
              onApply={(next) => {
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

interface PaymentDateRangeFormProps {
  initial: PaymentDayRange;
  onApply: (range: PaymentDayRange) => void;
}

function PaymentDateRangeForm({ initial, onApply }: PaymentDateRangeFormProps) {
  const { t } = useTranslation("finance");
  const formId: string = useId();
  const [draftFrom, setDraftFrom] = useState<string>(initial.from ?? "");
  const [draftTo, setDraftTo] = useState<string>(initial.to ?? "");
  const [problem, setProblem] = useState<RangeProblem | null>(null);
  const problemId: string = `${formId}-problem`;
  const problemKey: string | null = problem === "inverted" ? "overview.rangeInverted" : problem ? "overview.rangeInvalid" : null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const bothPresent: boolean = draftFrom !== "" && draftTo !== "";
    const detected: RangeProblem | null = bothPresent
      ? FinanceUrlState.rangeProblem(draftFrom, draftTo)
      : [draftFrom, draftTo].some((day) => day !== "" && !FinanceUrlState.isCalendarDate(day))
        ? "invalid"
        : null;
    setProblem(detected);
    if (detected === null) onApply({ from: draftFrom || null, to: draftTo || null });
  };

  return (
    <>
      <div role="group" aria-label={t("overview.presets")} className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset} variant="secondary" className="min-h-11 px-3" onClick={() => onApply({ from: FinanceUrlState.presetRange(preset).from, to: FinanceUrlState.presetRange(preset).to })}>
            {t(`overview.preset${preset[0].toUpperCase()}${preset.slice(1)}`)}
          </Button>
        ))}
      </div>
      <form onSubmit={submit} noValidate className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${formId}-from`} className="text-sm font-medium text-label">
            {t("overview.rangeFrom")}
          </label>
          <input id={`${formId}-from`} type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} aria-invalid={problem !== null} aria-describedby={problem ? problemId : undefined} className={INPUT_CLASSES} />
        </div>
        <div>
          <label htmlFor={`${formId}-to`} className="text-sm font-medium text-label">
            {t("overview.rangeTo")}
          </label>
          <input id={`${formId}-to`} type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} aria-invalid={problem !== null} aria-describedby={problem ? problemId : undefined} className={INPUT_CLASSES} />
        </div>
        {problemKey && (
          <p id={problemId} role="alert" className="col-span-2 text-sm text-destructive">
            {t(problemKey)}
          </p>
        )}
        <Button type="submit" className="col-span-2 min-h-12">
          {t("overview.applyRange")}
        </Button>
      </form>
    </>
  );
}
