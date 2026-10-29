import { forwardRef, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./Input";
import { DEFAULT_PHONE_PREFIX } from "../../lib/phone";

export interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode"> {
  label?: string;
  error?: string;
}

const DUPLICATED_PREFIX: string = `${DEFAULT_PHONE_PREFIX}+`;
const DOUBLED_COUNTRY_CODE: RegExp = /^\+992992([0-9]{9})$/;

function withoutDoubledPrefix(value: string): string {
  if (value.startsWith(DUPLICATED_PREFIX)) return value.slice(DEFAULT_PHONE_PREFIX.length);
  const doubled: RegExpExecArray | null = DOUBLED_COUNTRY_CODE.exec(value);
  return doubled ? `${DEFAULT_PHONE_PREFIX}${doubled[1]}` : value;
}

function asChangeEvent(target: HTMLInputElement): ChangeEvent<HTMLInputElement> {
  return { target, currentTarget: target, type: "change" } as unknown as ChangeEvent<HTMLInputElement>;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { placeholder, autoComplete = "tel", onFocus, onBlur, onChange, ...props },
  ref
) {
  const { t } = useTranslation("common");

  const handleFocus = (event: FocusEvent<HTMLInputElement>): void => {
    if (event.target.value === "" && !event.target.readOnly && !event.target.disabled) {
      event.target.value = DEFAULT_PHONE_PREFIX;
      onChange?.(asChangeEvent(event.target));
    }
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    if (event.target.value === DEFAULT_PHONE_PREFIX) {
      event.target.value = "";
      onChange?.(asChangeEvent(event.target));
    }
    onBlur?.(event);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const corrected: string = withoutDoubledPrefix(event.target.value);
    if (corrected !== event.target.value) {
      event.target.value = corrected;
    }
    onChange?.(event);
  };

  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      placeholder={placeholder ?? t("phonePlaceholder")}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      {...props}
    />
  );
});
