import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SCHOOL_TIMEZONE, formatDate, getActiveLocale, getSchoolCalendarDate, schoolCalendarDateToTimestamp } from "../../i18n/formatters";
import { CalendarDates } from "./calendarDates";

interface DatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  label: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  min?: string;
  max?: string;
}

class DateDisplay {
  static format(iso: string): string {
    const timestamp: string | null = schoolCalendarDateToTimestamp(iso);
    return timestamp === null ? "" : formatDate(timestamp, undefined, SCHOOL_TIMEZONE);
  }
}

export function DatePicker({ value, onChange, label, id, disabled = false, invalid = false, describedBy, min, max }: DatePickerProps) {
  const { t, i18n } = useTranslation("ui");
  const [draftText, setDraftText] = useState<string>(DateDisplay.format(value));
  const [typingInvalid, setTypingInvalid] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [focusedDate, setFocusedDate] = useState<string>(value !== "" ? value : getSchoolCalendarDate());
  const dayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    setDraftText(DateDisplay.format(value));
    setTypingInvalid(false);
  }, [value]);

  useEffect(() => {
    if (isOpen) dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate, isOpen]);

  const isOutOfRange = (iso: string): boolean => (min !== undefined && iso < min) || (max !== undefined && iso > max);

  const commitTyped = (): void => {
    if (draftText.trim() === "") {
      setTypingInvalid(false);
      if (value !== "") onChange("");
      return;
    }
    const parsed: string | null = CalendarDates.parseTyped(draftText);
    if (parsed === null || isOutOfRange(parsed)) {
      setTypingInvalid(true);
      return;
    }
    setTypingInvalid(false);
    setDraftText(DateDisplay.format(parsed));
    if (parsed !== value) onChange(parsed);
  };

  const selectDay = (iso: string): void => {
    if (isOutOfRange(iso)) return;
    onChange(iso);
    setIsOpen(false);
  };

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const offsets: Record<string, () => string> = {
      ArrowLeft: () => CalendarDates.addDays(focusedDate, -1),
      ArrowRight: () => CalendarDates.addDays(focusedDate, 1),
      ArrowUp: () => CalendarDates.addDays(focusedDate, -7),
      ArrowDown: () => CalendarDates.addDays(focusedDate, 7),
      PageUp: () => CalendarDates.addMonths(focusedDate, -1),
      PageDown: () => CalendarDates.addMonths(focusedDate, 1),
    };
    const resolve: (() => string) | undefined = offsets[event.key];
    if (resolve === undefined) return;
    event.preventDefault();
    setFocusedDate(resolve());
  };

  const locale: string = getActiveLocale(i18n.language);
  const monthTitle: string = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${focusedDate.slice(0, 7)}-01T00:00:00Z`));
  const weekdayNames: string[] = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + index))));
  const grid: string[] = CalendarDates.monthGrid(focusedDate);
  const today: string = getSchoolCalendarDate();
  const showInvalid: boolean = invalid || typingInvalid;

  return (
    <Popover.Root open={isOpen} onOpenChange={(nextOpen: boolean) => {
      if (nextOpen) setFocusedDate(value !== "" ? value : today);
      setIsOpen(nextOpen);
    }}>
      <div className={`flex min-h-12 w-full items-center rounded-[10px] border bg-card focus-within:ring-2 focus-within:ring-ring ${showInvalid ? "border-destructive" : "border-control-border"} ${disabled ? "bg-strip" : ""}`}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-label={label}
          aria-invalid={showInvalid || undefined}
          aria-describedby={describedBy}
          placeholder={t("datePicker.placeholder")}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={commitTyped}
          onKeyDown={(event) => { if (event.key === "Enter") commitTyped(); }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-ink tabular-nums placeholder:text-muted focus-visible:outline-none"
        />
        <Popover.Trigger
          disabled={disabled}
          aria-label={t("datePicker.open")}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
        >
          <CalendarDays size={18} aria-hidden="true" />
        </Popover.Trigger>
      </div>
      {typingInvalid && <p role="alert" className="mt-1 text-sm text-destructive">{t("datePicker.invalid")}</p>}
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={16} className="z-70">
          <Popover.Popup
            aria-label={t("datePicker.calendar")}
            initialFocus={() => dayRefs.current.get(focusedDate) ?? true}
            className="w-[min(20rem,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-2xl border border-border-warm bg-card p-3 shadow-lg focus-visible:outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] data-[starting-style]:opacity-0 motion-safe:data-[starting-style]:scale-[0.96] data-[ending-style]:opacity-0"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button type="button" aria-label={t("datePicker.previousMonth")} onClick={() => setFocusedDate(CalendarDates.addMonths(focusedDate, -1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span aria-live="polite" className="text-sm font-medium capitalize text-ink">{monthTitle}</span>
              <button type="button" aria-label={t("datePicker.nextMonth")} onClick={() => setFocusedDate(CalendarDates.addMonths(focusedDate, 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div role="grid" aria-label={monthTitle} className="grid grid-cols-7 gap-y-1 text-center">
              {weekdayNames.map((name) => (
                <span key={name} role="columnheader" className="pb-1 text-xs text-muted">{name}</span>
              ))}
              {grid.map((iso) => {
                const inMonth: boolean = iso.slice(0, 7) === focusedDate.slice(0, 7);
                const isSelected: boolean = iso === value;
                const isFocused: boolean = iso === focusedDate;
                return (
                  <button
                    key={iso}
                    ref={(element) => {
                      if (element === null) dayRefs.current.delete(iso);
                      else dayRefs.current.set(iso, element);
                    }}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={iso === today ? "date" : undefined}
                    aria-label={DateDisplay.format(iso)}
                    disabled={isOutOfRange(iso)}
                    tabIndex={isFocused ? 0 : -1}
                    onClick={() => selectDay(iso)}
                    onKeyDown={moveFocus}
                    className={[
                      "mx-auto inline-flex size-10 items-center justify-center rounded-[10px] text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                      "motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]",
                      isSelected ? "bg-maroon text-on-primary" : iso === today ? "border border-maroon text-maroon-text hover:bg-strip" : inMonth ? "text-ink hover:bg-strip" : "text-muted hover:bg-strip",
                    ].join(" ")}
                  >
                    {Number(iso.slice(8))}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
