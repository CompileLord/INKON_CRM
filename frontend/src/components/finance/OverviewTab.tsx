import { useTranslation } from "react-i18next";
import { useDebts, usePayments } from "../../lib/finance/hooks";
import type { CollectionRange } from "../../lib/finance/urlState";
import type { DebtItem, PaymentItem } from "../../lib/finance/types";
import { PaymentIdentity } from "../../lib/finance/paymentIdentity";
import { CourseBalanceIdentity } from "../../lib/finance/courseBalanceIdentity";
import { CourseBalanceRow } from "./CourseBalanceRow";
import { OverviewSummary } from "./OverviewSummary";
import { PaymentRow } from "./PaymentRow";
import { PreviewPanel } from "./PreviewPanel";

const PREVIEW_SIZE: number = 5;

interface OverviewTabProps {
  range: CollectionRange | null;
  onApplyRange: (range: CollectionRange) => void;
  onAcceptPayment: (debt: DebtItem) => void;
  onOpenDetails: (payment: PaymentItem) => void;
  onViewDebtors: () => void;
  onViewPayments: () => void;
}

export function OverviewTab({ range, onApplyRange, onAcceptPayment, onOpenDetails, onViewDebtors, onViewPayments }: OverviewTabProps) {
  const { t } = useTranslation("finance");
  const debts = useDebts(1, PREVIEW_SIZE);
  const payments = usePayments(1, PREVIEW_SIZE);
  const ambiguousPayers: Set<number> = PaymentIdentity.studentIdsSharingAName(payments.data?.items ?? []);
  const ambiguousStudents: Set<number> = CourseBalanceIdentity.studentIdsSharingAName(debts.data?.items ?? []);

  return (
    <div className="flex flex-col gap-6">
      <OverviewSummary range={range} onApplyRange={onApplyRange} />
      <div className="grid gap-6 @[52.5rem]:grid-cols-2">
        <PreviewPanel
          headingId="finance-course-balances"
          title={t("courseBalances.title")}
          loadingLabel={t("courseBalances.loading")}
          errorLabel={t("courseBalances.error")}
          emptyLabel={t("courseBalances.empty")}
          footerLabel={t("courseBalances.viewAll")}
          footerAriaLabel={t("courseBalances.viewAllLabel")}
          isPending={debts.isPending}
          isError={debts.isError}
          hasData={Boolean(debts.data)}
          isFetching={debts.isFetching}
          isEmpty={(debts.data?.items.length ?? 0) === 0}
          rowCount={PREVIEW_SIZE}
          onRetry={() => void debts.refetch()}
          onFooter={onViewDebtors}
        >
          {debts.data?.items.map((debt) => (
            <CourseBalanceRow key={`${debt.student.id}-${debt.course.id}`} debt={debt} showStudentNumber={ambiguousStudents.has(debt.student.id)} onAcceptPayment={onAcceptPayment} />
          ))}
        </PreviewPanel>
        <PreviewPanel
          headingId="finance-latest-payments"
          title={t("latestPayments.title")}
          loadingLabel={t("latestPayments.loading")}
          errorLabel={t("latestPayments.error")}
          emptyLabel={t("latestPayments.empty")}
          footerLabel={t("latestPayments.viewAll")}
          isPending={payments.isPending}
          isError={payments.isError}
          hasData={Boolean(payments.data)}
          isFetching={payments.isFetching}
          isEmpty={(payments.data?.items.length ?? 0) === 0}
          rowCount={PREVIEW_SIZE}
          onRetry={() => void payments.refetch()}
          onFooter={onViewPayments}
        >
          {payments.data?.items.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} showStudentNumber={ambiguousPayers.has(payment.student_id)} onOpenDetails={onOpenDetails} />
          ))}
        </PreviewPanel>
      </div>
    </div>
  );
}
