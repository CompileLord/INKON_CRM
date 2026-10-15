import { useId, useState, type RefObject } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, getSchoolCalendarDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";

interface SchoolDatePickerProps {
  id: string;
  value: string;
  onChange: (day: string) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  invalid?: boolean;
  describedBy?: string;
}

const MILLISECONDS_PER_DAY: number = 86_400_000;
const INPUT_CLASSES: string =
  "mt-1 min-h-12 w-full min-w-0 rounded-[10px] border border-control-border bg-card px-3 py-2 text-base text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SchoolDatePicker({ id, value, onChange, triggerRef, invalid = false, describedBy }: SchoolDatePickerProps) {
  const { t, i18n } = useTranslation("finance");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const apply = (day: string): void => {
    onChange(day);
    setIsOpen(false);
  };
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        id={id}
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`mt-1 flex min-h-12 w-full items-center gap-2 rounded-[10px] border bg-card px-3 py-2 text-left text-base tabular-nums hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${invalid ? "border-destructive" : "border-control-border"} ${value ? "text-ink" : "text-muted"}`}
      >
        <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-muted" />
        {value ? formatDate(value, i18n.language, SCHOOL_TIMEZONE) : t("paymentModal.dateChoose")}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-80">
          <Popover.Popup finalFocus={triggerRef} className="w-[min(20rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-4 shadow-lg transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-safe:transition-[opacity,transform] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 motion-safe:data-[ending-style]:scale-[0.96]">
            <Popover.Title className="text-sm font-semibold text-ink">{t("paymentModal.date")}</Popover.Title>
            <div role="group" aria-label={t("overview.presets")} className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-11 px-3" onClick={() => apply(getSchoolCalendarDate())}>
                {t("paymentModal.dateToday")}
              </Button>
              <Button variant="secondary" className="min-h-11 px-3" onClick={() => apply(getSchoolCalendarDate(new Date(Date.now() - MILLISECONDS_PER_DAY)))}>
                {t("paymentModal.dateYesterday")}
              </Button>
            </div>
            <DateDraftForm key={value} initial={value} onApply={apply} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DateDraftForm({ initial, onApply }: { initial: string; onApply: (day: string) => void }) {
  const { t } = useTranslation("finance");
  const inputId: string = useId();
  const [draft, setDraft] = useState<string>(initial);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onApply(draft);
      }}
      className="mt-3"
    >
      <label htmlFor={inputId} className="text-sm font-medium text-label">
        {t("paymentModal.date")}
      </label>
      <input id={inputId} type="date" value={draft} onChange={(event) => setDraft(event.target.value)} className={INPUT_CLASSES} />
      <Button type="submit" className="mt-3 min-h-12 w-full">
        {t("overview.applyRange")}
      </Button>
    </form>
  );
}
