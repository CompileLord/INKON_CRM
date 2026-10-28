import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TargetDrafts } from "../../lib/finance/paymentTargets";
import type { PaymentOption, PaymentOptions } from "../../lib/finance/types";
import { formatExactMoney, isPositiveMoney } from "../../lib/money";
import { Button } from "../ui/Button";
import { PaymentTargetRows, type TargetRowProblem } from "./PaymentTargetRows";
import { PaymentWalletCredit } from "./PaymentWalletCredit";

interface PaymentTargetsSectionProps {
  studentId: number;
  paymentOptions: UseQueryResult<PaymentOptions>;
  drafts: TargetDrafts;
  problems: Record<number, TargetRowProblem>;
  total: string;
  fieldProblem: string | null;
  failureKey: string | null;
  onChange: (enrollmentId: number, value: string) => void;
  onFill: (option: PaymentOption) => void;
}

export function PaymentTargetsSection({ studentId, paymentOptions, drafts, problems, total, fieldProblem, failureKey, onChange, onFill }: PaymentTargetsSectionProps) {
  const { t } = useTranslation(["finance", "common"]);
  const options: readonly PaymentOption[] = paymentOptions.data?.enrollments ?? [];
  const walletCredit: string = paymentOptions.data?.wallet_credit ?? "0";
  return (
    <section aria-label={t("finance:paymentModal.targetsLabel")} className="flex flex-col gap-3">
      {paymentOptions.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
          <span className="sr-only">{t("finance:paymentModal.loadingCourses")}</span>
          {[0, 1].map((row) => (
            <div key={row} aria-hidden="true" className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-40 rounded bg-border" />
                <div className="h-3 w-24 rounded bg-border" />
              </div>
              <div className="h-11 w-28 rounded-[10px] bg-border" />
            </div>
          ))}
        </div>
      ) : !paymentOptions.data ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-surface px-3 py-2 text-sm text-warning">
          <p>{t("finance:paymentModal.courseError")}</p>
          <Button type="button" variant="secondary" loading={paymentOptions.isFetching} onClick={() => void paymentOptions.refetch()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">{t("finance:paymentModal.noCourses")}</p>
      ) : (
        <PaymentTargetRows options={options} drafts={drafts} problems={problems} onChange={onChange} onFill={onFill} />
      )}
      {fieldProblem && (
        <p role="alert" className="text-sm text-destructive">
          {fieldProblem}
        </p>
      )}
      {failureKey && (
        <p role="alert" className="text-sm text-destructive">
          {t(`finance:${failureKey}`)}
        </p>
      )}
      {paymentOptions.data && isPositiveMoney(walletCredit) && <PaymentWalletCredit studentId={studentId} credit={walletCredit} options={options} />}
      <p className="flex items-baseline justify-between gap-3 text-sm text-ink">
        <span className="font-medium text-label">{t("finance:paymentModal.total")}</span>
        <span className="text-lg font-semibold tabular-nums">{t("finance:moneyAmount", { amount: formatExactMoney(total) })}</span>
      </p>
    </section>
  );
}
