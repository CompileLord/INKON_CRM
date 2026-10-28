import { Banknote, CalendarDays, Landmark, Printer, Receipt, UserCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePaymentReceipt, usePaymentStatus } from "../../lib/finance/hooks";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { PaymentStatus } from "../../lib/finance/paymentStatus";
import { ReceiptPrinter } from "../../lib/finance/receiptPrinter";
import type { PaymentItem, PaymentTarget } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { formatDate, formatDateTime, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Modal } from "../ui/Modal";
import { PaymentStatusNote } from "./PaymentStatusNote";

interface PaymentDetailModalProps {
  payment: PaymentItem | null;
  onClose: () => void;
}

interface DetailRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function DetailRow({ icon, label, children }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-label">{label}</dt>
        <dd className="mt-0.5 break-words text-ink">{children}</dd>
      </div>
    </div>
  );
}

export function PaymentDetailModal({ payment, onClose }: PaymentDetailModalProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const status = usePaymentStatus(payment);
  const receipt = usePaymentReceipt(payment?.id ?? null);
  const known: PaymentItem | null = status?.payment ?? payment;
  const allocations =
    receipt.data?.allocations.map((allocation) => ({ ...allocation, amount: allocation.allocated_amount })) ?? known?.allocations ?? [];
  const studentName: string | null = known ? PaymentIdentity.displayName(known) ?? receipt.data?.student_name ?? null : null;
  const [printBlocked, setPrintBlocked] = useState<boolean>(false);
  const targets: readonly PaymentTarget[] = receipt.data?.targets ?? known?.targets ?? [];
  const isReceiptReserved: boolean = receipt.isLoading && !receipt.data;

  const printReceipt = (): void => {
    if (!receipt.data) return;
    const data = receipt.data;
    const printed: boolean = ReceiptPrinter.print({
      title: t("paymentDetail.printTitle", { number: data.receipt_number }),
      heading: t("paymentDetail.printTitle", { number: data.receipt_number }),
      lines: [
        { label: t("paymentDetail.student"), value: data.student_name },
        { label: t("paymentModal.date"), value: formatDateTime(data.occurred_at, i18n.language, SCHOOL_TIMEZONE) },
        { label: t("paymentModal.method"), value: data.method ? t(`common:enums.paymentMethod.${data.method}`) : t("paymentDetail.unavailable") },
        { label: t("paymentDetail.acceptedBy"), value: data.accepted_by_name },
        { label: t("paymentDetail.printTotal"), value: t("moneyAmount", { amount: formatExactMoney(data.amount) }) },
      ],
      targetsHeading: t("paymentDetail.targets"),
      targets: targets.map((target) => ({ label: target.course_title, value: t("moneyAmount", { amount: formatExactMoney(target.amount) }) })),
      comment: data.comment ?? null,
    });
    setPrintBlocked(!printed);
  };

  return (
    <Modal
      open={Boolean(payment)}
      onClose={onClose}
      title={t("paymentDetail.title", { id: payment?.id })}
      maxWidthClassName="sm:max-w-[560px]"
      fullScreenOnMobile
    >
      {known && (
        <div className="flex flex-col gap-5 text-sm text-ink">
          <div>
            <p className="break-words text-base font-semibold">{studentName ?? t("row.unknownStudent")}</p>
            {receipt.data?.student_email && <p className="break-words text-muted">{receipt.data.student_email}</p>}
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-label">
              {t("paymentDetail.cashReceived")}
              <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("paymentDetail.cashReceived") })}>{t("paymentDetail.cashInfo")}</InfoTooltip>
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">{t("moneyAmount", { amount: formatExactMoney(known.amount) })}</p>
            {PaymentStatus.hasNotice(known) && (
              <div className="mt-1 flex flex-col gap-0.5">
                <PaymentStatusNote payment={known} />
              </div>
            )}
            {status?.isStale && (
              <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-surface px-3 py-2 text-warning">
                <p>{t("paymentDetail.statusStale")}</p>
                <Button variant="secondary" loading={status.isRefreshing} onClick={status.retry}>
                  {t("common:retry")}
                </Button>
              </div>
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailRow icon={known.method === "transfer" ? <Landmark size={16} /> : <Banknote size={16} />} label={t("paymentModal.method")}>
              {known.method ? t(`common:enums.paymentMethod.${known.method}`) : t("paymentDetail.unavailable")}
            </DetailRow>
            <DetailRow icon={<CalendarDays size={16} />} label={t("paymentModal.date")}>
              <span className="tabular-nums">{formatDateTime(known.paid_at, i18n.language, SCHOOL_TIMEZONE)}</span>
            </DetailRow>
            <DetailRow icon={<Receipt size={16} />} label={t("paymentDetail.receiptReference")}>
              {receipt.data ? (
                <span className="tabular-nums">{receipt.data.receipt_number}</span>
              ) : isReceiptReserved ? (
                <span role="status" aria-busy="true" className="block">
                  <span className="sr-only">{t("paymentDetail.loadingReceipt")}</span>
                  <span aria-hidden="true" className="block h-5 w-28 rounded bg-strip motion-safe:animate-pulse" />
                </span>
              ) : (
                <span className="text-muted">{t("paymentDetail.unavailable")}</span>
              )}
            </DetailRow>
            <DetailRow icon={<UserCheck size={16} />} label={t("paymentDetail.acceptedBy")}>
              {receipt.data ? (
                receipt.data.accepted_by_name
              ) : isReceiptReserved ? (
                <span aria-hidden="true" className="block h-5 w-32 rounded bg-strip motion-safe:animate-pulse" />
              ) : (
                <span className="text-muted">{t("paymentDetail.unavailable")}</span>
              )}
            </DetailRow>
          </dl>
          {receipt.isError && !receipt.data && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-surface px-3 py-2 text-warning">
              <p>{t("paymentDetail.receiptError")}</p>
              <Button variant="secondary" loading={receipt.isFetching} onClick={() => void receipt.refetch()}>
                {t("common:retry")}
              </Button>
            </div>
          )}
          {targets.length > 0 && (
            <section aria-labelledby="payment-targets">
              <h3 id="payment-targets" className="font-semibold">
                {t("paymentDetail.targets")}
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {targets.map((target) => (
                  <li key={target.enrollment_id} className="flex items-start justify-between gap-3 py-3">
                    <p className="min-w-0 break-words">{target.course_title}</p>
                    <p className="shrink-0 font-medium tabular-nums">{t("moneyAmount", { amount: formatExactMoney(target.amount) })}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {targets.length === 0 && (
            <section aria-labelledby="payment-current-allocations">
              <h3 id="payment-current-allocations" className="flex items-center gap-1 font-semibold">
                {t("paymentDetail.currentAllocations")}
                <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("paymentDetail.currentAllocations") })}>{t("paymentDetail.allocationsInfo")}</InfoTooltip>
              </h3>
              {allocations.length > 0 ? (
                <ul className="mt-2 divide-y divide-border">
                  {allocations.map((allocation) => (
                    <li key={allocation.charge_id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0 break-words">
                        <p>{allocation.course_title}</p>
                        <p className="text-xs text-muted tabular-nums">{formatDate(allocation.due_date, i18n.language, SCHOOL_TIMEZONE)}</p>
                      </div>
                      <p className="shrink-0 font-medium tabular-nums">{t("moneyAmount", { amount: formatExactMoney(allocation.amount) })}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-muted">{t("paymentDetail.noAllocations")}</p>
              )}
            </section>
          )}
          {known.comment && (
            <section>
              <h3 className="font-semibold">{t("paymentModal.comment")}</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted">{known.comment}</p>
            </section>
          )}
          <div className="flex flex-col gap-2">
            <Button variant="secondary" disabled={!receipt.data} onClick={printReceipt}>
              <Printer size={18} aria-hidden="true" />
              {t("paymentDetail.print")}
            </Button>
            {printBlocked && (
              <p role="alert" className="text-destructive">
                {t("paymentDetail.printBlocked")}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
