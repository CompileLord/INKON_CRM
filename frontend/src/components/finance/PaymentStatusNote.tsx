import { Ban, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { compareMoney, formatExactMoney } from "../../lib/money";

interface PaymentStatusNoteProps {
  payment: Pick<PaymentItem, "is_voided" | "refunded_amount">;
}

export function PaymentStatusNote({ payment }: PaymentStatusNoteProps) {
  const { t } = useTranslation("finance");
  return (
    <>
      {payment.is_voided && (
        <p className="inline-flex items-center gap-1.5 text-destructive">
          <Ban size={14} aria-hidden="true" />
          {t("paymentDetail.voided")}
        </p>
      )}
      {compareMoney(payment.refunded_amount, "0") > 0 && (
        <p className="inline-flex items-center gap-1.5 text-warning tabular-nums">
          <Undo2 size={14} aria-hidden="true" />
          {t("paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}
        </p>
      )}
    </>
  );
}
