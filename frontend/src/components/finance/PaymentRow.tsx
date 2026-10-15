import { Banknote, Eye, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { compareMoney, formatExactMoney } from "../../lib/money";
import { formatDateTime, formatNumber, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";

interface PaymentRowProps {
  payment: PaymentItem;
  showStudentNumber: boolean;
  onOpenDetails: (payment: PaymentItem) => void;
}

export function PaymentRow({ payment, showStudentNumber, onOpenDetails }: PaymentRowProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const courses: string = payment.allocations.map((allocation) => allocation.course_title).join(" · ");
  const methodLabel: string = payment.method
    ? t(`common:enums.paymentMethod.${payment.method}`)
    : t("finance:paymentDetail.unavailable");
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3 text-sm text-ink">
      <div className="min-w-0 flex-1 basis-40 break-words">
        <p className="font-medium">{PaymentIdentity.displayName(payment) ?? t("finance:row.unknownStudent")}</p>
        {showStudentNumber && (
          <p className="text-xs text-muted tabular-nums">
            {t("finance:analytics.studentNumber", { id: formatNumber(payment.student_id, i18n.language) })}
          </p>
        )}
        <p className="mt-0.5 text-muted">{courses || t("finance:analytics.unapplied")}</p>
        {payment.is_voided && <p className="mt-0.5 text-destructive">{t("finance:paymentDetail.voided")}</p>}
        {compareMoney(payment.refunded_amount, "0") > 0 && (
          <p className="mt-0.5 text-warning tabular-nums">
            {t("finance:paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center justify-between gap-3 @[30rem]:w-auto @[30rem]:justify-end @[30rem]:gap-4">
        <div className="text-right">
          <p className="font-semibold tabular-nums">
            {t("finance:moneyAmount", { amount: formatExactMoney(payment.amount) })}
          </p>
          <p className="mt-0.5 inline-flex items-center justify-end gap-1 text-xs text-muted">
            {payment.method === "transfer" ? <Landmark size={12} aria-hidden="true" /> : <Banknote size={12} aria-hidden="true" />}
            {methodLabel}
          </p>
          <p className="mt-0.5 text-xs text-muted tabular-nums">
            {formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}
          </p>
        </div>
        <Button
          variant="secondary"
          aria-label={t("finance:row.detailsFor", { id: formatNumber(payment.id, i18n.language) })}
          onClick={() => onOpenDetails(payment)}
        >
          <Eye size={16} aria-hidden="true" />
          <span className="@[30rem]:sr-only">{t("finance:latestPayments.details")}</span>
        </Button>
      </div>
    </li>
  );
}
