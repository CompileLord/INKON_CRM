import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PaymentItem } from "../../lib/finance/types";
import { usePaymentReceipt } from "../../lib/finance/hooks";
import { formatExactMoney, compareMoney } from "../../lib/money";
import { formatDateTime, formatDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

export function PaymentDetailModal({ payment, onClose }: { payment: PaymentItem | null; onClose: () => void }) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const receipt = usePaymentReceipt(payment?.id ?? null);
  const allocations = receipt.data?.allocations.map(allocation => ({ ...allocation, amount: allocation.allocated_amount })) ?? payment?.allocations ?? [];
  return <Modal open={Boolean(payment)} onClose={onClose} title={t("paymentDetail.title", { id: payment?.id })} maxWidthClassName="sm:max-w-[560px]" fullScreenOnMobile>
    {payment && <div className="flex flex-col gap-4 break-words text-sm text-ink">
      <dl className="space-y-3"><div><dt className="text-muted">{t("paymentDetail.student")}</dt><dd>{receipt.data?.student_name ?? t("analytics.studentNumber", { id: payment.student_id })}</dd></div><div><dt className="text-muted">{t("paymentDetail.cashReceived")}</dt><dd className="text-xl font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(payment.amount) })}</dd></div><div><dt className="text-muted">{t("paymentModal.method")}</dt><dd>{payment.method ? t(`common:enums.paymentMethod.${payment.method}`) : t("paymentDetail.unavailable")}</dd></div><div><dt className="text-muted">{t("paymentModal.date")}</dt><dd className="tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</dd></div></dl>
      {payment.is_voided && <p className="rounded-xl bg-danger-surface p-3 text-destructive">{t("paymentDetail.voided")}</p>}
      {compareMoney(payment.refunded_amount, "0") > 0 && <p className="text-warning tabular-nums">{t("paymentDetail.refunded", { amount: formatExactMoney(payment.refunded_amount) })}</p>}
      {receipt.isLoading && !receipt.data ? <div role="status" className="flex items-center gap-2 text-muted"><BrandActivityIndicator size={20} aria-hidden="true" />{t("paymentDetail.loadingReceipt")}</div> : receipt.isError ? <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-warning-surface p-3 text-warning"><p>{t("paymentDetail.receiptError")}</p><Button variant="secondary" loading={receipt.isFetching} onClick={() => receipt.refetch()}>{t("common:retry")}</Button></div> : null}
      {receipt.data && <dl className="space-y-3"><div><dt className="text-muted">{t("paymentDetail.receiptReference")}</dt><dd>{receipt.data.receipt_number}</dd></div><div><dt className="text-muted">{t("paymentDetail.acceptedBy")}</dt><dd>{receipt.data.accepted_by_name}</dd></div></dl>}
      <section aria-labelledby="payment-current-allocations"><h3 id="payment-current-allocations" className="font-semibold">{t("paymentDetail.currentAllocations")}</h3>{allocations.length ? <ul className="mt-2 divide-y divide-border">{allocations.map(allocation => <li key={allocation.charge_id} className="space-y-1 py-3"><p>{allocation.course_title}</p><p className="text-muted tabular-nums">{formatDate(allocation.due_date, i18n.language, SCHOOL_TIMEZONE)}</p><p className="tabular-nums">{t("moneyAmount", { amount: formatExactMoney(allocation.amount) })}</p></li>)}</ul> : <p className="mt-2 text-muted">{t("analytics.unapplied")}</p>}</section>
      {payment.comment && <section><h3 className="font-semibold">{t("paymentModal.comment")}</h3><p className="mt-1 whitespace-pre-wrap text-muted">{payment.comment}</p></section>}
    </div>}
  </Modal>;
}

export function PaymentCompletion({ payment }: { payment: PaymentItem | null }) {
  const { t } = useTranslation("finance");
  const [showDetail, setShowDetail] = useState(false);
  if (!payment) return null;
  return <><section role="status" aria-label={t("paymentCompletion.title")} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"><div className="min-w-0 break-words"><p className="font-semibold text-success">{t("paymentCompletion.saved", { id: payment.id })}</p><p className="mt-1 text-sm text-muted">{t("paymentCompletion.refreshHelp")}</p></div><Button variant="secondary" onClick={() => setShowDetail(true)}>{t("paymentCompletion.viewPayment")}</Button></section><PaymentDetailModal payment={showDetail ? payment : null} onClose={() => setShowDetail(false)} /></>;
}
