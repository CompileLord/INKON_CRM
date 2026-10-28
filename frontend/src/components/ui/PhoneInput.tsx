import { forwardRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./Input";

export interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode"> {
  label?: string;
  error?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { placeholder, autoComplete = "tel", ...props },
  ref
) {
  const { t } = useTranslation("common");

  return (
    <Input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete={autoComplete}
      placeholder={placeholder ?? t("phonePlaceholder")}
      {...props}
    />
  );
});
