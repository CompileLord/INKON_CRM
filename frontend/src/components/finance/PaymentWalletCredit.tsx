import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApplyWalletCredit } from "../../lib/finance/hooks";
import { PaymentTargets, type CreditAllocationError, type CreditAllocationErrorCode } from "../../lib/finance/paymentTargets";
import type { CourseCreditAllocationResponse, PaymentOption } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { Button } from "../ui/Button";
import { ListboxPicker } from "../ui/ListboxPicker";

const CREDIT_ERROR_KEYS: Record<CreditAllocationErrorCode, string> = {
  invalid_payment_target: "paymentModal.applyCreditInvalidTarget",
  no_wallet_credit: "paymentModal.applyCreditNoCredit",
  nothing_to_allocate: "paymentModal.applyCreditNothing",
  credit_exceeds_available: "paymentModal.applyCreditExceedsCredit",
  payment_target_exceeds_balance: "paymentModal.applyCreditExceedsDebt",
};

interface PaymentWalletCreditProps {
  studentId: number;
  credit: string;
  options: readonly PaymentOption[];
  onApplied: (allocatedAmount: string) => void;
}

export function PaymentWalletCredit({ studentId, credit, options, onApplied }: PaymentWalletCreditProps) {
  const { t } = useTranslation("finance");
  const apply = useApplyWalletCredit();
  const candidates: PaymentOption[] = options.filter(PaymentTargets.hasDebt);
  const [picking, setPicking] = useState<boolean>(false);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(null);
  const [failed, setFailed] = useState<boolean>(false);
  const [problem, setProblem] = useState<CreditAllocationError | null>(null);
  const selected: number | null = enrollmentId ?? candidates[0]?.enrollment_id ?? null;

  const submit = async (): Promise<void> => {
    if (selected === null) return;
    setFailed(false);
    setProblem(null);
    try {
      const result: CourseCreditAllocationResponse = await apply.mutateAsync({ studentId, enrollmentId: selected });
      setPicking(false);
      onApplied(result.allocated_amount);
    } catch (failure) {
      const parsed: CreditAllocationError | null = PaymentTargets.parseCreditAllocationError(failure);
      setProblem(parsed);
      setFailed(parsed === null);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-strip p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink tabular-nums">{t("paymentModal.walletCredit", { amount: formatExactMoney(credit) })}</p>
        {candidates.length > 0 && !picking && (
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            {t("paymentModal.applyCredit")}
          </Button>
        )}
      </div>
      {picking && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ListboxPicker
              layout="field"
              icon={null}
              label={t("paymentModal.creditCourse")}
              ariaLabel={t("paymentModal.creditCourse")}
              value={String(selected ?? "")}
              options={candidates.map((option) => ({ value: String(option.enrollment_id), label: option.course_title }))}
              onChange={(value) => setEnrollmentId(Number(value))}
            />
          </div>
          <Button type="button" loading={apply.isPending} onClick={() => void submit()}>
            {t("paymentModal.applyCreditConfirm")}
          </Button>
          <Button type="button" variant="secondary" disabled={apply.isPending} onClick={() => setPicking(false)}>
            {t("paymentModal.applyCreditCancel")}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-destructive">
          {t(CREDIT_ERROR_KEYS[problem.code], { maximum: formatExactMoney(problem.maximum ?? "0") })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-destructive">
          {t("paymentModal.applyCreditFailed")}
        </p>
      )}
    </div>
  );
}
