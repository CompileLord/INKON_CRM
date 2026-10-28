import { forwardRef, useEffect, useState, type ChangeEvent, type FocusEventHandler } from "react";
import { useTranslation } from "react-i18next";

const COMPLETE_TIME_PATTERN: RegExp = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TimeInput24Props {
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function normalizeTimeDraft(raw: string): string {
  const digits: string = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function toDisplayValue(value: string): string {
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
}

export const TimeInput24 = forwardRef<HTMLInputElement, TimeInput24Props>(function TimeInput24(
  { value, onChange, onBlur, invalid, className = "", ...props },
  ref
) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<string>(toDisplayValue(value));

  useEffect(() => {
    const shown: string = toDisplayValue(value);
    setDraft((current) => ((COMPLETE_TIME_PATTERN.test(current) ? current : "") === shown ? current : shown));
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next: string = normalizeTimeDraft(event.target.value);
    setDraft(next);
    onChange(COMPLETE_TIME_PATTERN.test(next) ? next : "");
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      placeholder={t("timePlaceholder")}
      value={draft}
      onChange={handleChange}
      onBlur={onBlur}
      aria-invalid={invalid || (draft !== "" && !COMPLETE_TIME_PATTERN.test(draft))}
      className={className}
      {...props}
    />
  );
});
