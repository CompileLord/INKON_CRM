import { useEffect } from "react";
import { Plus, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePayments } from "../../lib/finance/hooks";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { FinanceUrlState, type PaymentsViewState } from "../../lib/finance/urlState";
import type { PaymentItem } from "../../lib/finance/types";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";
import { CLEARED_PAYMENT_FILTERS, PaymentsToolbar } from "./PaymentsToolbar";
import { PaymentRegistryRow } from "./PaymentRegistryRow";
import { useElementWidth } from "./useElementWidth";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;
const TABLE_MINIMUM_WIDTH_PIXELS: number = 960;

interface PaymentsTabProps {
  view: PaymentsViewState;
  onPageChange: (page: number) => void;
  onChangeFilters: (filters: Partial<Omit<PaymentsViewState, "page">>) => void;
  onOpenDetails: (payment: PaymentItem) => void;
  onAcceptPayment: () => void;
}

export function PaymentsTab({ view, onPageChange, onChangeFilters, onOpenDetails, onAcceptPayment }: PaymentsTabProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [sectionRef, sectionWidth] = useElementWidth<HTMLElement>();
  const payments = usePayments(view.page, PAGE_SIZE, FinanceUrlState.paymentFilters(view));
  const loaded: PaymentItem[] = payments.data?.items ?? [];
  const total: number = payments.data?.total ?? 0;
  const totalPages: number = payments.data?.total_pages ?? 1;
  const lastValidPage: number = Math.max(1, totalPages);
  const layout: "table" | "list" = sectionWidth >= TABLE_MINIMUM_WIDTH_PIXELS ? "table" : "list";
  const ambiguousPayers: Set<number> = PaymentIdentity.studentIdsSharingAName(loaded);
  const hasFilters: boolean = FinanceUrlState.hasPaymentFilters(view);
  const firstRecord: number = (view.page - 1) * PAGE_SIZE + 1;
  const courseTitle: string | undefined = loaded
    .flatMap((payment) => payment.allocations)
    .find((allocation) => allocation.course_id === view.courseId)?.course_title;
  const courseLabel: string | null =
    view.courseId === null ? null : t("finance:paymentsTab.chipCourse", { course: courseTitle ?? t("finance:paymentsTab.selectedCourse") });
  const rowOfFilteredStudent: PaymentItem | undefined = loaded.find((payment) => payment.student_id === view.studentId);
  const studentFromRows: string | null = rowOfFilteredStudent ? PaymentIdentity.displayName(rowOfFilteredStudent) : null;
  const studentLabel: string | null =
    view.studentId === null ? null : (view.studentName ?? studentFromRows ?? t("finance:paymentsTab.selectedStudent"));

  useEffect(() => {
    if (payments.data && view.page > lastValidPage) onPageChange(lastValidPage);
  }, [payments.data, view.page, lastValidPage, onPageChange]);

  const retry = (
    <Button variant="secondary" loading={payments.isFetching} onClick={() => void payments.refetch()}>
      {t("common:retry")}
    </Button>
  );

  const rows = loaded.map((payment) => (
    <PaymentRegistryRow key={payment.id} payment={payment} layout={layout} showStudentNumber={ambiguousPayers.has(payment.student_id)} onOpenDetails={onOpenDetails} />
  ));

  return (
    <section ref={sectionRef} aria-labelledby="finance-payments-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Receipt size={18} aria-hidden="true" />
          <span id="finance-payments-heading">{t("finance:paymentsTab.title")}</span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("finance:paymentsTab.title") })}>{t("finance:paymentsTab.info")}</InfoTooltip>
        </h2>
        {payments.data && <p className="text-sm text-label tabular-nums">{t("finance:paymentsTab.total", { total: formatNumber(total, i18n.language) })}</p>}
      </div>
      <PaymentsToolbar view={view} courseLabel={courseLabel} studentLabel={studentLabel} onChangeFilters={onChangeFilters} />
      {payments.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("finance:paymentsTab.loading")}</span>
          <ul aria-hidden="true" className="divide-y divide-border motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className={layout === "table" ? "h-[4.5rem] px-4 py-3" : "h-[8.5rem] px-4 py-3"}>
                <div className="h-full rounded-lg bg-strip" />
              </li>
            ))}
          </ul>
        </div>
      ) : !payments.data ? (
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">{t("finance:paymentsTab.error")}</p>
          {retry}
        </div>
      ) : loaded.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted">{t(hasFilters ? "finance:paymentsTab.noMatch" : "finance:paymentsTab.empty")}</p>
          {hasFilters ? (
            <Button variant="secondary" onClick={() => onChangeFilters(CLEARED_PAYMENT_FILTERS)}>
              {t("finance:debtorsTab.clearFilters")}
            </Button>
          ) : (
            <Button onClick={onAcceptPayment}>
              <Plus size={18} aria-hidden="true" />
              {t("finance:acceptPayment")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {payments.isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-surface px-4 py-2 text-sm text-warning">
              <p>{t("finance:refreshFailed")}</p>
              {retry}
            </div>
          )}
          {layout === "table" ? (
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-border bg-strip text-xs text-label">
                  <th scope="col" className="w-[26%] px-4 py-2 font-medium">{t("finance:paymentsTab.columnStudent")}</th>
                  <th scope="col" className="w-[18%] px-3 py-2 font-medium">{t("finance:paymentsTab.columnAllocation")}</th>
                  <th scope="col" className="w-[14%] px-3 py-2 text-right font-medium">{t("finance:paymentsTab.columnCash")}</th>
                  <th scope="col" className="w-[16%] px-3 py-2 font-medium">{t("finance:paymentsTab.columnMethod")}</th>
                  <th scope="col" className="w-[14%] px-3 py-2 font-medium">{t("finance:paymentsTab.columnStatus")}</th>
                  <th scope="col" className="w-[12%] px-2 py-2 font-medium">
                    <span className="sr-only">{t("finance:paymentsTab.columnActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">{rows}</tbody>
            </table>
          ) : (
            <ul className="divide-y divide-border">{rows}</ul>
          )}
        </>
      )}
      {payments.data && loaded.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
          <p className="text-sm text-label tabular-nums">
            {t("finance:debtorsTab.range", {
              from: formatNumber(firstRecord, i18n.language),
              to: formatNumber(firstRecord + loaded.length - 1, i18n.language),
              total: formatNumber(total, i18n.language),
            })}
          </p>
          {totalPages > 1 && <Pagination page={view.page} totalPages={totalPages} onPageChange={onPageChange} />}
        </div>
      )}
    </section>
  );
}
