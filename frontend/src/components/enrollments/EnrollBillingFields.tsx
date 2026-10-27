import { useTranslation } from "react-i18next";
import { Toggle } from "../ui/Toggle";
import { isPositiveMoney, isValidMoneyString } from "../../lib/money";

const FEE_PATTERN: RegExp = /^\d+(\.\d{1,2})?$/;

export function isAcceptableFee(value: string): boolean {
  const trimmed: string = value.trim();
  return FEE_PATTERN.test(trimmed) && isValidMoneyString(trimmed) && isPositiveMoney(trimmed);
}

interface EnrollBillingFieldsProps {
  isGrant: boolean;
  onGrantChange: (isGrant: boolean) => void;
  monthlyFee: string;
  onMonthlyFeeChange: (fee: string) => void;
  feeIsValid: boolean;
  disabled: boolean;
}

export function EnrollBillingFields({ isGrant, onGrantChange, monthlyFee, onMonthlyFeeChange, feeIsValid, disabled }: EnrollBillingFieldsProps) {
  const { t } = useTranslation("enrollments");
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <Toggle checked={isGrant} onChange={onGrantChange} label={t("billing.grantToggle")} disabled={disabled} />
      {!isGrant ? (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <span>{t("billing.monthlyFee")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={monthlyFee}
              onChange={(event) => onMonthlyFeeChange(event.target.value)}
              disabled={disabled}
              aria-invalid={!feeIsValid}
              className="w-32 min-h-[44px] rounded-xl border border-control-border bg-card px-3 py-2 text-right text-base font-normal tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon dark:focus-visible:ring-accent sm:text-sm"
            />
          </label>
          {!feeIsValid ? <span role="alert" className="text-right text-xs text-destructive">{t("billing.monthlyFeeInvalid")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
