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
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

export function AccountantDashboard() {
  const { t, i18n } = useTranslation(["dashboard", "finance", "common"]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [recordedPayment, setRecordedPayment] = useState<PaymentItem | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  const period = getSchoolMonthRange();
  const analytics = useFinanceAnalytics(period.start, period.end);
  const payments = usePayments(1, 5);
  const recentPayments = payments.data?.items ?? [];
  const money = (amount: string) => t("finance:moneyAmount", { amount: formatExactMoney(amount) });
  const reference = (payment: PaymentItem) => t("finance:paymentDetail.title", { id: formatNumber(payment.id, i18n.language) });
  const student = (payment: PaymentItem) => PaymentIdentity.displayName(payment) ?? t("finance:row.unknownStudent");
  const allocationContext = (payment: PaymentItem) => {
    const courses = Array.from(new Map(payment.allocations.map(allocation => [allocation.course_id, allocation.course_title])).values());
    return courses.length ? courses.join(" · ") : t("finance:analytics.unapplied");
  };
  const method = (payment: PaymentItem) => payment.method ? t(`common:enums.paymentMethod.${payment.method}`) : t("finance:paymentDetail.unavailable");
  const status = (payment: PaymentItem) => <>
    {payment.is_voided && <p className="text-sm text-destructive">{t("finance:paymentDetail.voided")}</p>}
    {compareMoney(payment.refunded_amount, "0") > 0 && <p className="text-sm text-warning tabular-nums">{t("finance:paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}</p>}
  </>;
  const detailAction = (payment: PaymentItem) => <Button variant="secondary" aria-label={t("viewPaymentReference", { id: formatNumber(payment.id, i18n.language) })} onClick={() => setSelectedPayment(payment)}>{t("finance:paymentCompletion.viewPayment")}</Button>;
  const summaryError = <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"><p className="text-sm text-destructive">{t("errorLoadingSummary")}</p><Button variant="secondary" loading={analytics.isFetching} onClick={() => analytics.refetch()}>{t("common:retry")}</Button></div>;
  const listError = <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-destructive">{t("errorLoadingPayments")}</p><Button variant="secondary" loading={payments.isFetching} onClick={() => payments.refetch()}>{t("common:retry")}</Button></div>;

  return <div className="@container flex flex-col gap-5 pb-8">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0"><h1 className="text-2xl leading-8 sm:text-[1.75rem] sm:leading-9 font-semibold text-ink">{t("financialOverview")}</h1><p className="mt-1 text-sm text-muted">{t("financialSubtitle")}</p></div>
      <Button className="w-full shrink-0 sm:w-auto" onClick={() => setIsPaymentModalOpen(true)}><Plus size={18} aria-hidden="true" />{t("acceptPayment")}</Button>
    </header>
    <PaymentCompletion payment={recordedPayment} />
    <section aria-label={t("summaryTitle")}>
      {analytics.isError && analytics.data && <div className="mb-3">{summaryError}<p className="mt-2 text-sm text-warning">{t("staleFailedNotice")}</p></div>}
      {analytics.isLoading && !analytics.data ? <div role="status" aria-busy="true" className="rounded-2xl border border-border bg-card p-4"><span className="sr-only">{t("common:loading")}</span><div className="grid gap-4 @[48rem]:grid-cols-3 motion-safe:animate-pulse">{[1, 2, 3].map(index => <div key={index} className="h-20 rounded-xl bg-strip" />)}</div></div> : !analytics.data ? summaryError : <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 @[48rem]:grid-cols-3">
        <div className="min-w-0"><h2 className="break-words text-sm text-muted">{t("finance:analytics.totalReceivable")}</h2><p className="mt-1 break-words text-2xl font-semibold text-ink tabular-nums">{money(analytics.data.net_receivable)}</p><p className="mt-1 text-xs text-muted">{t("currentReceivableScope")}</p></div>
        <div className="min-w-0"><h2 className="break-words text-sm text-muted">{t("netCashCollected")}</h2><p className="mt-1 break-words text-2xl font-semibold text-ink tabular-nums">{money(analytics.data.collected_in_period)}</p><p className="mt-1 text-xs text-muted tabular-nums">{t("collectionDateScope", { start: formatDate(period.start, i18n.language, SCHOOL_TIMEZONE), end: formatDate(period.end, i18n.language, SCHOOL_TIMEZONE) })}</p><p className="mt-1 text-xs text-muted">{t("cashRefundScope")}</p></div>
        <div className="min-w-0"><h2 className="break-words text-sm text-muted">{t("totalDebtors")}</h2><p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{formatNumber(analytics.data.unpaid_students_count, i18n.language)}</p></div>
      </div>}
    </section>
    <section aria-labelledby="recent-payments-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3"><h2 id="recent-payments-heading" className="flex items-center gap-2 text-base font-semibold text-ink">{t("recentPayments")}{payments.isLoading && !payments.data && <BrandActivityIndicator size={20} aria-hidden="true" />}</h2><p className="mt-1 text-xs text-muted">{t("recentPaymentsScope")}</p></div>
      {payments.isError && payments.data && <div>{listError}<p className="px-4 pb-3 text-sm text-warning">{t("staleFailedNotice")}</p></div>}
      {payments.isLoading && !payments.data ? <div role="status" aria-busy="true"><span className="sr-only">{t("loadingOperations")}</span><div className="motion-safe:animate-pulse" aria-hidden="true">{[1, 2, 3, 4, 5].map(index => <div key={index} className="h-36 border-t border-border px-4 py-3 @[56rem]:h-20"><div className="h-full rounded-lg bg-strip" /></div>)}</div></div> : !payments.data ? listError : !recentPayments.length ? <div className="p-5"><h3 className="text-sm font-semibold text-ink">{t("noOperations")}</h3><p className="mt-2 text-sm text-muted">{t("noPaymentsHelp")}</p></div> : <>
        <table className="hidden w-full table-fixed text-sm @[56rem]:table"><thead><tr className="border-b border-border bg-strip text-left text-xs text-muted"><th className="w-[22%] px-4 py-3 font-medium">{t("paymentReference")}</th><th className="w-[25%] px-3 py-3 font-medium">{t("allocationContext")}</th><th className="w-[18%] px-3 py-3 text-right font-medium">{t("finance:paymentDetail.cashReceived")}</th><th className="w-[21%] px-3 py-3 font-medium">{t("paymentMethodDate")}</th><th className="w-[14%] px-3 py-3 font-medium"><span className="sr-only">{t("finance:paymentCompletion.viewPayment")}</span></th></tr></thead><tbody className="divide-y divide-border">{recentPayments.map(payment => <tr key={payment.id} className="text-ink hover:bg-row-hover motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"><td className="break-words px-4 py-3"><p className="font-medium tabular-nums">{reference(payment)}</p><p className="mt-1 text-muted tabular-nums">{student(payment)}</p>{status(payment)}</td><td className="break-words px-3 py-3 text-muted">{allocationContext(payment)}</td><td className="break-words px-3 py-3 text-right font-semibold tabular-nums">{money(payment.amount)}</td><td className="break-words px-3 py-3"><p>{method(payment)}</p><p className="mt-1 text-xs text-muted tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</p></td><td className="px-3 py-3">{detailAction(payment)}</td></tr>)}</tbody></table>
        <div className="divide-y divide-border @[56rem]:hidden">{recentPayments.map(payment => <article key={payment.id} aria-label={reference(payment)} className="px-4 py-3 text-sm text-ink"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-medium tabular-nums">{reference(payment)}</h3><p className="mt-1 text-muted tabular-nums">{student(payment)}</p></div><div className="max-w-full"><p className="text-xs text-muted">{t("finance:paymentDetail.cashReceived")}</p><p className="mt-1 whitespace-nowrap font-semibold tabular-nums">{money(payment.amount)}</p></div></div><p className="mt-2 break-words text-muted">{allocationContext(payment)}</p>{status(payment)}<div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p>{method(payment)}</p><p className="mt-1 text-xs text-muted tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</p></div>{detailAction(payment)}</div></article>)}</div>
      </>}
    </section>
    <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
    <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} onSuccess={payment => { setRecordedPayment(payment); analytics.refetch(); payments.refetch(); }} />
  </div>;
}
