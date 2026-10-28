import { useState } from "react";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DebtorsTab } from "../components/finance/DebtorsTab";
import { FinanceTabs } from "../components/finance/FinanceTabs";
import { OverviewTab } from "../components/finance/OverviewTab";
import { PaymentCompletion } from "../components/finance/PaymentCompletion";
import { PaymentDetailModal } from "../components/finance/PaymentDetailDialog";
import { PaymentModal } from "../components/finance/PaymentModal";
import { PaymentsTab } from "../components/finance/PaymentsTab";
import { useFinanceNavigation } from "../components/finance/useFinanceNavigation";
import { Button } from "../components/ui/Button";
import type { DebtItem, PaymentItem } from "../lib/finance/types";

interface PaymentContext {
  studentId: number;
  studentName: string;
  courseId: number;
}

export function Finance() {
  const { t } = useTranslation("finance");
  const navigation = useFinanceNavigation();
  const { state } = navigation;
  const [isPaymentOpen, setIsPaymentOpen] = useState<boolean>(false);
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(null);
  const [recordedPayment, setRecordedPayment] = useState<PaymentItem | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentItem | null>(null);

  const openGlobalPayment = (): void => {
    setPaymentContext(null);
    setIsPaymentOpen(true);
  };

  const openDebtPayment = (debt: DebtItem): void => {
    setPaymentContext({
      studentId: debt.student.id,
      studentName: `${debt.student.first_name} ${debt.student.last_name}`,
      courseId: debt.course.id,
    });
    setIsPaymentOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        actions={
          <Button onClick={openGlobalPayment}>
            <Plus size={18} aria-hidden="true" />
            {t("acceptPayment")}
          </Button>
        }
      />
      <PaymentCompletion payment={recordedPayment} />
      <FinanceTabs selected={state.tab} onSelect={navigation.selectTab} />
      <div key={state.tab} role="tabpanel" className="flex flex-col gap-6 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out motion-safe:starting:opacity-0" id={`finance-panel-${state.tab}`} aria-labelledby={`finance-tab-${state.tab}`} tabIndex={-1}>
        {state.tab === "overview" && (
          <OverviewTab
            range={state.range}
            onApplyRange={navigation.applyRange}
            onAcceptPayment={openDebtPayment}
            onOpenDetails={setDetailPayment}
            onViewDebtors={() => navigation.selectTab("debtors")}
            onViewPayments={() => navigation.selectTab("payments")}
          />
        )}
        {state.tab === "debtors" && (
          <DebtorsTab
            view={state.debtors}
            recordedPayment={recordedPayment}
            onPageChange={navigation.setDebtorsPage}
            onChangeFilters={navigation.changeDebtorsFilters}
            onAcceptPayment={openDebtPayment}
          />
        )}
        {state.tab === "payments" && (
          <PaymentsTab
            view={state.payments}
            onPageChange={navigation.setPaymentsPage}
            onChangeFilters={navigation.changePaymentsFilters}
            onOpenDetails={setDetailPayment}
            onAcceptPayment={openGlobalPayment}
          />
        )}
      </div>
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={setRecordedPayment}
        defaultStudentId={paymentContext?.studentId}
        defaultStudentName={paymentContext?.studentName}
        defaultCourseId={paymentContext?.courseId}
      />
      <PaymentDetailModal payment={detailPayment} onClose={() => setDetailPayment(null)} />
    </PageContainer>
  );
}
