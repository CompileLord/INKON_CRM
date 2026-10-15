import { Ban, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { compareMoney, formatExactMoney } from "../../lib/money";

interface PaymentStatusPillProps {
  payment: Pick<PaymentItem, "is_voided" | "refunded_amount">;
}

const PILL_CLASSES: string = "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium tabular-nums";

export function PaymentStatusPill({ payment }: PaymentStatusPillProps) {
  const { t } = useTranslation("finance");
  const refunded: boolean = compareMoney(payment.refunded_amount, "0") > 0;
  const amount: string = formatExactMoney(payment.refunded_amount);
  return (
    <span className="flex flex-col items-start gap-1">
      {payment.is_voided && (
        <span title={t("paymentDetail.voided")} className={`${PILL_CLASSES} bg-danger-surface text-destructive`}>
          <Ban size={12} aria-hidden="true" />
          {t("paymentsTab.pillVoided")}
          <span className="sr-only">{t("paymentDetail.voided")}</span>
        </span>
      )}
      {refunded && (
        <span title={t("paymentDetail.refunded", { amount })} className={`${PILL_CLASSES} bg-warning-surface text-warning`}>
          <Undo2 size={12} aria-hidden="true" />
          {t("paymentsTab.pillRefunded", { amount })}
        </span>
      )}
    </span>
  );
}
