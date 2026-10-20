import { useEffect } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePayments } from "../../lib/finance/hooks";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { PaymentAllocationSummary } from "../../lib/finance/paymentAllocationSummary";
import { PaymentStatus } from "../../lib/finance/paymentStatus";
import { FinanceUrlState, type PaymentsViewState } from "../../lib/finance/urlState";
import type { PaymentItem } from "../../lib/finance/types";
import { formatExactMoney } from "../../lib/money";
import { formatDateTime, formatNumber, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { Pagination } from "../ui/Pagination";
import { CLEARED_PAYMENT_FILTERS, PaymentsToolbar } from "./PaymentsToolbar";
import { PaymentMethodLabel } from "./PaymentMethodLabel";
import { PaymentStatusPill } from "./PaymentStatusPill";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;

interface PaymentsTabProps {
  view: PaymentsViewState;
  onPageChange: (page: number) => void;
  onChangeFilters: (filters: Partial<Omit<PaymentsViewState, "page">>) => void;
  onOpenDetails: (payment: PaymentItem) => void;
  onAcceptPayment: () => void;
}

function AllocationSummaryText({ payment }: { payment: PaymentItem }) {
  const { t } = useTranslation("finance");
  const summary = PaymentAllocationSummary.of(payment.allocations);
  if (summary.kind === "none") return <span className="text-muted">{t("paymentsTab.allocationNone")}</span>;
  if (summary.kind === "single") return <span>{summary.courseTitle}</span>;
  return <span>{t("paymentsTab.allocationMany", { count: summary.courseCount })}</span>;
}

export function PaymentsTab({ view, onPageChange, onChangeFilters, onOpenDetails, onAcceptPayment }: PaymentsTabProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const payments = usePayments(view.page, PAGE_SIZE, FinanceUrlState.paymentFilters(view));
  const loaded: PaymentItem[] = payments.data?.items ?? [];
  const total: number = payments.data?.total ?? 0;
  const totalPages: number = payments.data?.total_pages ?? 1;
  const lastValidPage: number = Math.max(1, totalPages);
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

  const studentNameOf = (payment: PaymentItem): string => PaymentIdentity.displayName(payment) ?? t("finance:row.unknownStudent");
  const columns: readonly DataTableColumn<PaymentItem>[] = [
    {
      key: "student",
      header: t("finance:paymentsTab.columnStudent"),
      cell: (payment: PaymentItem) => (
        <span className="flex flex-col">
          <span className="font-medium">{studentNameOf(payment)}</span>
          {ambiguousPayers.has(payment.student_id) && (
            <span className="text-muted tabular-nums">{t("finance:analytics.studentNumber", { id: formatNumber(payment.student_id, i18n.language) })}</span>
          )}
        </span>
      ),
    },
    { key: "allocation", header: t("finance:paymentsTab.columnAllocation"), cell: (payment: PaymentItem) => <AllocationSummaryText payment={payment} /> },
    {
      key: "cash",
      header: t("finance:paymentsTab.columnCash"),
      numeric: true,
      cell: (payment: PaymentItem) => <span className="font-semibold">{t("finance:moneyAmount", { amount: formatExactMoney(payment.amount) })}</span>,
    },
    {
      key: "method",
      header: t("finance:paymentsTab.columnMethod"),
      cell: (payment: PaymentItem) => (
        <span className="flex flex-col">
          <span className="text-muted"><PaymentMethodLabel method={payment.method} /></span>
          <span className="text-muted tabular-nums">{formatDateTime(payment.paid_at, i18n.language, SCHOOL_TIMEZONE)}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: t("finance:paymentsTab.columnStatus"),
      cell: (payment: PaymentItem) => (PaymentStatus.hasNotice(payment) ? <PaymentStatusPill payment={payment} /> : <span className="sr-only">{t("finance:paymentsTab.statusRecorded")}</span>),
    },
    {
      key: "actions",
      header: t("finance:paymentsTab.columnActions"),
      cell: (payment: PaymentItem) => (
        <Button variant="secondary" aria-label={t("finance:paymentsTab.detailsFor", { student: studentNameOf(payment), id: payment.id })} onClick={() => onOpenDetails(payment)}>
          {t("finance:latestPayments.details")}
        </Button>
      ),
    },
  ];

  const hasRows: boolean = loaded.length > 0;
  const showTable: boolean = payments.isPending || hasRows;

  return (
    <section aria-labelledby="finance-payments-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="finance-payments-heading" className="text-base font-semibold text-ink">{t("finance:paymentsTab.title")}</h2>
        {payments.data && <p className="text-sm text-muted tabular-nums">{t("finance:paymentsTab.total", { total: formatNumber(total, i18n.language) })}</p>}
      </div>
      <PaymentsToolbar view={view} courseLabel={courseLabel} studentLabel={studentLabel} onChangeFilters={onChangeFilters} />
      {payments.isError && payments.data && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <p>{t("finance:refreshFailed")}</p>
          <Button variant="secondary" loading={payments.isFetching} onClick={() => void payments.refetch()}>{t("common:retry")}</Button>
        </div>
      )}
      {showTable ? (
        <DataTable
          caption={t("finance:paymentsTab.title")}
          columns={columns}
          rows={loaded}
          rowKey={(payment: PaymentItem) => String(payment.id)}
          isLoading={payments.isPending}
          isError={false}
          onRetry={() => void payments.refetch()}
          emptyTitle={t("finance:paymentsTab.empty")}
          skeletonRowCount={SKELETON_ROWS}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          {!payments.data ? (
            <ErrorState message={t("finance:paymentsTab.error")} onRetry={() => void payments.refetch()} />
          ) : (
            <EmptyState
              title={t(hasFilters ? "finance:paymentsTab.noMatch" : "finance:paymentsTab.empty")}
              action={hasFilters
                ? <Button variant="secondary" onClick={() => onChangeFilters(CLEARED_PAYMENT_FILTERS)}>{t("finance:debtorsTab.clearFilters")}</Button>
                : <Button onClick={onAcceptPayment}><Plus size={18} aria-hidden="true" />{t("finance:acceptPayment")}</Button>}
            />
          )}
        </div>
      )}
      {payments.data && hasRows && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted tabular-nums">
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
