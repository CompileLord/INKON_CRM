import { Banknote, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentMethod } from "../../lib/finance/types";

const OPTIONS: readonly PaymentMethod[] = ["cash", "transfer"];

interface PaymentMethodRadiosProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

export function PaymentMethodRadios({ value, onChange }: PaymentMethodRadiosProps) {
  const { t } = useTranslation(["finance", "common"]);
  return (
    <fieldset>
      <legend className="text-sm font-medium text-label">{t("finance:paymentModal.method")}</legend>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {OPTIONS.map((option) => (
          <label
            key={option}
            className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border p-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${
              value === option ? "border-maroon bg-strip font-medium text-maroon" : "border-control-border bg-card text-ink hover:bg-strip"
            }`}
          >
            <input type="radio" name="payment-method" value={option} checked={value === option} onChange={() => onChange(option)} className="sr-only" />
            {option === "transfer" ? <Landmark size={16} aria-hidden="true" /> : <Banknote size={16} aria-hidden="true" />}
            {t(`common:enums.paymentMethod.${option}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
