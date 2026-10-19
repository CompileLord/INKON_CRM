import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentModal } from "../finance/PaymentModal";
import { PaymentCompletion } from "../finance/PaymentCompletion";
import { PaymentDetailModal } from "../finance/PaymentDetailDialog";
import { useFinanceAnalytics, usePayments } from "../../lib/finance/hooks";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import type { PaymentItem } from "../../lib/finance/types";
import { formatExactMoney, compareMoney } from "../../lib/money";
import { formatDate, formatDateTime, formatNumber, getSchoolMonthRange, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { PageContainer } from "../ui/PageContainer";
import { PageHeader } from "../ui/PageHeader";
import { StatGroup, StatTile } from "../ui/StatGroup";
import type { MenuItem } from "../ui/Menu";
import { StaleNotice } from "./StaleNotice";
import { SummaryValue } from "./SummaryValue";

export function AccountantDashboard() {
  const { t, i18n } = useTranslation(["dashboard", "finance", "common"]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [recordedPayment, setRecordedPayment] = useState<PaymentItem | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  const period = getSchoolMonthRange();
  const analytics = useFinanceAnalytics(period.start, period.end);
  const payments = usePayments(1, 5);
  const recentPayments: PaymentItem[] = payments.data?.items ?? [];
  const money = (amount: string): string => t("finance:moneyAmount", { amount: formatExactMoney(amount) });
  const student = (payment: PaymentItem): string => PaymentIdentity.displayName(payment) ?? t("finance:row.unknownStudent");
  const allocationContext = (payment: PaymentItem): string => {
    const courses: string[] = Array.from(new Map(payment.allocations.map((allocation) => [allocation.course_id, allocation.course_title])).values());
    return courses.length ? courses.join(" · ") : t("finance:analytics.unapplied");
  };
  const method = (payment: PaymentItem): string => payment.method ? t(`common:enums.paymentMethod.${payment.method}`) : t("finance:paymentDetail.unavailable");

  const columns: readonly DataTableColumn<PaymentItem>[] = [
    {
      key: "student",
      header: t("paymentReference"),
      cell: (payment: PaymentItem) => (
        <span className="flex flex-col">
          <span className="font-medium">{student(payment)}</span>
          {payment.is_voided && <span className="text-sm text-destructive">{t("finance:paymentDetail.voided")}</span>}
          {compareMoney(payment.refunded_amount, "0") > 0 && <span className="text-sm text-warning tabular-nums">{t("finance:paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}</span>}
        </span>
      ),
    },
    { key: "course", header: t("allocationContext"), cell: (payment: PaymentItem) => <span className="text-muted">{allocationContext(payment)}</span> },
    { key: "amount", header: t("finance:paymentDetail.cashReceived"), numeric: true, cell: (payment: PaymentItem) => <span className="font-semibold">{money(payment.amount)}</span> },
    {
      key: "method",
      header: t("paymentMethodDate"),
      cell: (payment: PaymentItem) => (
        <span className="flex flex-col">
          <span>{method(payment)}</span>
          <span className="text-sm text-muted tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</span>
        </span>
      ),
    },
  ];
  const rowMenu = (payment: PaymentItem): readonly MenuItem[] => [
    { key: "view", label: t("finance:paymentCompletion.viewPayment"), onSelect: () => setSelectedPayment(payment) },
  ];

  const hasStaleSummary: boolean = analytics.isError && analytics.data !== undefined;
  const hasStalePayments: boolean = payments.isError && payments.data !== undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t("financialOverview")}
        actions={<Button onClick={() => setIsPaymentModalOpen(true)}><Plus size={18} aria-hidden="true" />{t("acceptPayment")}</Button>}
      />
      <PaymentCompletion payment={recordedPayment} />
      <section aria-label={t("summaryTitle")} className="flex flex-col gap-3">
        {analytics.data === undefined && analytics.isError ? (
          <div className="rounded-2xl border border-border bg-card">
            <ErrorState message={t("errorLoadingSummary")} onRetry={() => analytics.refetch()} />
          </div>
        ) : (
        <StatGroup>
          <StatTile
            label={t("finance:analytics.totalReceivable")}
            value={<SummaryValue query={analytics} render={(data) => money(data.net_receivable)} />}
          />
          <StatTile
            label={t("netCashCollected")}
            value={<SummaryValue query={analytics} render={(data) => money(data.collected_in_period)} />}
            hint={analytics.data === undefined ? undefined : t("collectionDateScope", { start: formatDate(period.start, i18n.language, SCHOOL_TIMEZONE), end: formatDate(period.end, i18n.language, SCHOOL_TIMEZONE) })}
          />
          <StatTile
            label={t("totalDebtors")}
            value={<SummaryValue query={analytics} render={(data) => formatNumber(data.unpaid_students_count, i18n.language)} />}
          />
        </StatGroup>
        )}
        {hasStaleSummary && <StaleNotice onRetry={() => analytics.refetch()} />}
      </section>
      <section aria-labelledby="recent-payments-heading" className="flex flex-col gap-3">
        <h2 id="recent-payments-heading" className="text-base font-semibold text-ink">{t("recentPayments")}</h2>
        {hasStalePayments && <StaleNotice onRetry={() => payments.refetch()} />}
        <DataTable
          caption={t("recentPayments")}
          columns={columns}
          rows={recentPayments}
          rowKey={(payment: PaymentItem) => String(payment.id)}
          rowMenu={rowMenu}
          isLoading={payments.isLoading && !payments.data}
          isError={payments.isError && !payments.data}
          onRetry={() => payments.refetch()}
          emptyTitle={t("noOperations")}
          emptyDescription={t("noPaymentsHelp")}
          skeletonRowCount={5}
        />
      </section>
      <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} onSuccess={(payment: PaymentItem) => { setRecordedPayment(payment); analytics.refetch(); payments.refetch(); }} />
    </PageContainer>
  );
}
