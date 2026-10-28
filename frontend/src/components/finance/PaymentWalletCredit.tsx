import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApplyWalletCredit } from "../../lib/finance/hooks";
import { PaymentTargets } from "../../lib/finance/paymentTargets";
import type { PaymentOption } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { Button } from "../ui/Button";

interface PaymentWalletCreditProps {
  studentId: number;
  credit: string;
  options: readonly PaymentOption[];
}

export function PaymentWalletCredit({ studentId, credit, options }: PaymentWalletCreditProps) {
  const { t } = useTranslation("finance");
  const apply = useApplyWalletCredit();
  const candidates: PaymentOption[] = options.filter(PaymentTargets.hasDebt);
  const [picking, setPicking] = useState<boolean>(false);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(null);
  const [failed, setFailed] = useState<boolean>(false);
  const selected: number | null = enrollmentId ?? candidates[0]?.enrollment_id ?? null;

  const submit = async (): Promise<void> => {
    if (selected === null) return;
    setFailed(false);
    try {
      await apply.mutateAsync({ studentId, enrollmentId: selected });
      setPicking(false);
    } catch {
      setFailed(true);
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
          <select
            aria-label={t("paymentModal.creditCourse")}
            value={selected ?? ""}
            onChange={(event) => setEnrollmentId(Number(event.target.value))}
            className="min-h-11 min-w-0 flex-1 rounded-[10px] border border-control-border bg-card px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {candidates.map((option) => (
              <option key={option.enrollment_id} value={option.enrollment_id}>
                {option.course_title}
              </option>
            ))}
          </select>
          <Button type="button" loading={apply.isPending} onClick={() => void submit()}>
            {t("paymentModal.applyCreditConfirm")}
          </Button>
          <Button type="button" variant="secondary" disabled={apply.isPending} onClick={() => setPicking(false)}>
            {t("paymentModal.applyCreditCancel")}
          </Button>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-destructive">
          {t("paymentModal.applyCreditFailed")}
        </p>
      )}
    </div>
  );
}
