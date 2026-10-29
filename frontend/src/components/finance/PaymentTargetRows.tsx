import { useTranslation } from "react-i18next";
import { PaymentTargets, type TargetDrafts } from "../../lib/finance/paymentTargets";
import type { PaymentOption } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { EnrollmentStatusBadge } from "../enrollments/EnrollmentStatusBadge";
import { GrantBadge } from "../enrollments/GrantBadge";

export interface TargetRowProblem {
  messageKey: string;
  maximum?: string;
}

interface PaymentTargetRowsProps {
  options: readonly PaymentOption[];
  drafts: TargetDrafts;
  problems: Record<number, TargetRowProblem>;
  onChange: (enrollmentId: number, value: string) => void;
  onFill: (option: PaymentOption) => void;
}

const INPUT_CLASSES: string =
  "min-h-11 w-28 min-w-0 rounded-[10px] border bg-card px-3 py-2 text-right text-base text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-strip disabled:text-muted";

export function PaymentTargetRows({ options, drafts, problems, onChange, onFill }: PaymentTargetRowsProps) {
  const { t } = useTranslation("finance");
  return (
    <ul className="flex flex-col divide-y divide-border">
      {options.map((option) => {
        const id: number = option.enrollment_id;
        const payable: boolean = PaymentTargets.isPayable(option);
        const hasDebt: boolean = PaymentTargets.hasDebt(option);
        const showAmount: boolean = option.billing_mode !== "grant" || payable;
        const problem: TargetRowProblem | undefined = problems[id];
        const problemId: string = `payment-target-${id}-problem`;
        return (
          <li key={id} data-testid={`payment-target-${id}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-40 break-words">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <span>{option.course_title}</span>
                  <GrantBadge billingMode={option.billing_mode === "grant" ? "grant" : "paid"} />
                  {option.status === "withdrawn" && <EnrollmentStatusBadge status="withdrawn" />}
                </p>
                {showAmount && (
                  <p className="text-sm text-muted tabular-nums">
                    {hasDebt
                      ? `${t("paymentModal.debtLine", { amount: formatExactMoney(option.open_debt) })}${option.overdue_days > 0 ? ` · ${t("overdueDaysCount", { count: option.overdue_days })}` : ""}`
                      : t("paymentModal.noDebt")}
                  </p>
                )}
              </div>
              {showAmount && (
                <div className="flex items-center gap-2">
                  <input
                    id={`payment-amount-${id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={!payable}
                    value={drafts[id] ?? ""}
                    aria-label={t("paymentModal.amountFor", { course: option.course_title })}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? problemId : undefined}
                    onChange={(event) => onChange(id, event.target.value)}
                    className={`${INPUT_CLASSES} ${problem ? "border-destructive" : "border-control-border"}`}
                  />
                  {hasDebt && (
                    <button
                      type="button"
                      aria-label={t("paymentModal.fillDebtFor", { course: option.course_title })}
                      onClick={() => onFill(option)}
                      className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium text-maroon-text hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
                    >
                      {t("paymentModal.fillDebt")}
                    </button>
                  )}
                </div>
              )}
            </div>
            {problem && (
              <p id={problemId} role="alert" className="text-sm text-destructive">
                {t(problem.messageKey, { maximum: problem.maximum === undefined ? "" : formatExactMoney(problem.maximum) })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
