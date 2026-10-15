import { useState } from "react";
import { CircleCheck, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { InfoTooltip } from "../ui/InfoTooltip";
import { PaymentDetailModal } from "./PaymentDetailDialog";
import { QUIET_ACTION_CLASSES } from "./quietActionClasses";

export function PaymentCompletion({ payment }: { payment: PaymentItem | null }) {
  const { t } = useTranslation("finance");
  const [shownPaymentId, setShownPaymentId] = useState<number | null>(null);
  if (!payment) return null;
  const studentName: string = PaymentIdentity.displayName(payment) ?? t("row.unknownStudent");
  return (
    <>
      <section
        role="status"
        aria-label={t("paymentCompletion.title")}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-border bg-card px-4 py-2"
      >
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 break-words font-semibold text-success">
          <CircleCheck size={18} aria-hidden="true" className="shrink-0" />
          <span>{t("paymentCompletion.saved", { id: payment.id })}</span>
          <span className="font-normal text-muted">{studentName}</span>
          <InfoTooltip label={t("overview.aboutMetric", { label: t("paymentCompletion.title") })}>{t("paymentCompletion.refreshHelp")}</InfoTooltip>
        </p>
        <button type="button" onClick={() => setShownPaymentId(payment.id)} className={QUIET_ACTION_CLASSES}>
          <Eye size={16} aria-hidden="true" />
          {t("paymentCompletion.viewPayment")}
        </button>
      </section>
      <PaymentDetailModal payment={shownPaymentId === payment.id ? payment : null} onClose={() => setShownPaymentId(null)} />
    </>
  );
}
