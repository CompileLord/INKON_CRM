import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { compareMoney, formatExactMoney } from "../../lib/money";
import { formatDateTime, formatNumber, SCHOOL_TIMEZONE } from "../../i18n/formatters";

interface PaymentRowProps {
  payment: PaymentItem;
  showStudentNumber: boolean;
  onOpenDetails: (payment: PaymentItem) => void;
}

export function PaymentRow({ payment, showStudentNumber, onOpenDetails }: PaymentRowProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const courses: string = payment.allocations.map((allocation) => allocation.course_title).join(" · ");
  const studentName: string = PaymentIdentity.displayName(payment) ?? t("finance:row.unknownStudent");
  const methodLabel: string = payment.method ? t(`common:enums.paymentMethod.${payment.method}`) : t("finance:paymentDetail.unavailable");
  return (
    <li>
      <button
        type="button"
        aria-label={t("finance:paymentsTab.detailsFor", { student: studentName, id: formatNumber(payment.id, i18n.language) })}
        onClick={() => onOpenDetails(payment)}
        className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-[10px] px-3 py-2 text-left text-sm text-ink hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
      >
        <span className="min-w-0 flex-1 basis-40 break-words">
          <span className="block font-medium">{studentName}</span>
          {showStudentNumber && <span className="block text-sm text-muted tabular-nums">{t("finance:analytics.studentNumber", { id: formatNumber(payment.student_id, i18n.language) })}</span>}
          <span className="block text-muted">{courses || t("finance:analytics.unapplied")}</span>
          {payment.is_voided && <span className="block text-destructive">{t("finance:paymentDetail.voided")}</span>}
          {compareMoney(payment.refunded_amount, "0") > 0 && (
            <span className="block text-warning tabular-nums">{t("finance:paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}</span>
          )}
        </span>
        <span className="text-right">
          <span className="block font-semibold tabular-nums">{t("finance:moneyAmount", { amount: formatExactMoney(payment.amount) })}</span>
          <span className="block text-muted">{methodLabel}</span>
          <span className="block text-muted tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</span>
        </span>
      </button>
    </li>
  );
}
