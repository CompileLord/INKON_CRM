import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentStatus } from "../../lib/finance/paymentStatus";
import type { PaymentItem } from "../../lib/finance/types";
import { PaymentAllocationSummary } from "../../lib/finance/paymentAllocationSummary";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { formatExactMoney } from "../../lib/money";
import { formatDateTime, formatNumber, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { PaymentMethodLabel } from "./PaymentMethodLabel";
import { PaymentStatusPill } from "./PaymentStatusPill";
import { QUIET_ACTION_CLASSES } from "./quietActionClasses";

interface PaymentRegistryRowProps {
  payment: PaymentItem;
  layout: "table" | "list";
  showStudentNumber: boolean;
  onOpenDetails: (payment: PaymentItem) => void;
}

function AllocationSummaryText({ payment }: { payment: PaymentItem }) {
  const { t } = useTranslation("finance");
  const summary = PaymentAllocationSummary.of(payment.allocations);
  if (summary.kind === "none") return <span className="text-muted">{t("paymentsTab.allocationNone")}</span>;
  if (summary.kind === "single") return <span>{summary.courseTitle}</span>;
  return <span>{t("paymentsTab.allocationMany", { count: summary.courseCount })}</span>;
}

export function PaymentRegistryRow({ payment, layout, showStudentNumber, onOpenDetails }: PaymentRegistryRowProps) {
  const { t, i18n } = useTranslation("finance");
  const studentName: string = PaymentIdentity.displayName(payment) ?? t("row.unknownStudent");
  const amount: string = t("moneyAmount", { amount: formatExactMoney(payment.amount) });
  const paidAt: string = formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE);

  const identity = (
    <div className="min-w-0 break-words">
      <p className="font-medium text-ink">{studentName}</p>
      {showStudentNumber && (
        <p className="text-xs text-muted tabular-nums">{t("analytics.studentNumber", { id: formatNumber(payment.student_id, i18n.language) })}</p>
      )}
    </div>
  );

  const detailsAction = (
    <button
      type="button"
      aria-label={t("paymentsTab.detailsFor", { student: studentName, id: payment.id })}
      onClick={() => onOpenDetails(payment)}
      className={QUIET_ACTION_CLASSES + " px-2 text-muted"}
    >
      <Eye size={16} aria-hidden="true" />
      <span>{t("latestPayments.details")}</span>
    </button>
  );

  if (layout === "table") {
    return (
      <tr data-row-key={payment.id} className="align-top text-sm text-ink hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150">
        <td className="px-4 py-3">{identity}</td>
        <td className="break-words px-3 py-3">
          <AllocationSummaryText payment={payment} />
        </td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums">{amount}</td>
        <td className="px-3 py-3">
          <p className="text-muted">
            <PaymentMethodLabel method={payment.method} />
          </p>
          <p className="mt-0.5 text-xs text-muted tabular-nums">{paidAt}</p>
        </td>
        <td className="px-3 py-3">
          {PaymentStatus.hasNotice(payment) ? <PaymentStatusPill payment={payment} /> : <span className="sr-only">{t("paymentsTab.statusRecorded")}</span>}
        </td>
        <td className="px-2 py-1.5 text-right">{detailsAction}</td>
      </tr>
    );
  }

  return (
    <li data-row-key={payment.id} className="px-4 py-3 text-sm text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {identity}
          <p className="mt-0.5 text-xs text-muted tabular-nums">{paidAt}</p>
        </div>
        <p className="shrink-0 text-base font-semibold tabular-nums">{amount}</p>
      </div>
      <p className="mt-1 line-clamp-2 break-words text-muted">
        <AllocationSummaryText payment={payment} />
      </p>
      {PaymentStatus.hasNotice(payment) && (
        <div className="mt-1">
          <PaymentStatusPill payment={payment} />
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          <PaymentMethodLabel method={payment.method} />
        </span>
        {detailsAction}
      </div>
    </li>
  );
}
