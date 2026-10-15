import { useEffect } from "react";
import { Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePayments } from "../../lib/finance/hooks";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { FinanceUrlState, type PaymentsViewState } from "../../lib/finance/urlState";
import type { PaymentItem } from "../../lib/finance/types";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";
import { PaymentRow } from "./PaymentRow";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;

interface PaymentsTabProps {
  view: PaymentsViewState;
  onPageChange: (page: number) => void;
  onOpenDetails: (payment: PaymentItem) => void;
}

export function PaymentsTab({ view, onPageChange, onOpenDetails }: PaymentsTabProps) {
  const { t } = useTranslation(["finance", "common"]);
  const payments = usePayments(view.page, PAGE_SIZE, FinanceUrlState.paymentFilters(view));
  const totalPages: number = payments.data?.total_pages ?? 1;
  const ambiguousPayers: Set<number> = PaymentIdentity.studentIdsSharingAName(payments.data?.items ?? []);
  const lastValidPage: number = Math.max(1, totalPages);

  useEffect(() => {
    if (payments.data && view.page > lastValidPage) onPageChange(lastValidPage);
  }, [payments.data, view.page, lastValidPage, onPageChange]);

  return (
    <section aria-labelledby="finance-payments-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
          <Receipt size={18} aria-hidden="true" />
          <span id="finance-payments-heading">{t("finance:paymentsTab.title")}</span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("finance:paymentsTab.title") })}>{t("finance:paymentsTab.info")}</InfoTooltip>
          <span className="rounded-full bg-strip px-2 py-0.5 text-xs font-normal text-label">{t("finance:paymentsTab.scope")}</span>
        </h2>
      </div>
      {payments.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("finance:paymentsTab.loading")}</span>
          <ul aria-hidden="true" className="@container divide-y divide-border motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className="h-[7.5rem] px-4 py-3 @[30rem]:h-[6.5rem]">
                <div className="h-full rounded-lg bg-strip" />
              </li>
            ))}
          </ul>
        </div>
      ) : !payments.data ? (
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">{t("finance:paymentsTab.error")}</p>
          <Button variant="secondary" loading={payments.isFetching} onClick={() => void payments.refetch()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : payments.data.items.length === 0 ? (
        <p className="p-4 text-sm text-muted">{t("finance:paymentsTab.empty")}</p>
      ) : (
        <>
          {payments.isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-surface px-4 py-2 text-sm text-warning">
              <p>{t("finance:refreshFailed")}</p>
              <Button variant="secondary" loading={payments.isFetching} onClick={() => void payments.refetch()}>
                {t("common:retry")}
              </Button>
            </div>
          )}
          <ul className="@container divide-y divide-border">
            {payments.data.items.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} showStudentNumber={ambiguousPayers.has(payment.student_id)} onOpenDetails={onOpenDetails} />
            ))}
          </ul>
        </>
      )}
      {totalPages > 1 && (
        <div className="flex justify-end border-t border-border p-3">
          <Pagination page={view.page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </section>
  );
}
