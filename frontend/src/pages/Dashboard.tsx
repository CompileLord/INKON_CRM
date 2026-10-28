import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { GreetingBanner } from "../components/dashboard/GreetingBanner";
import { StatsRow } from "../components/dashboard/StatsRow";
import { AttentionList, type PaymentRequest } from "../components/dashboard/AttentionList";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { TodayLessons } from "../components/dashboard/TodayLessons";
import { AccountantDashboard } from "../components/dashboard/AccountantDashboard";
import { PaymentCompletion } from "../components/finance/PaymentCompletion";
import { PaymentModal } from "../components/finance/PaymentModal";
import { PageContainer } from "../components/ui/PageContainer";
import { MentorDashboard } from "../components/dashboard/MentorDashboard";
import { StudentDashboard } from "../components/dashboard/StudentDashboard";
import { DASHBOARD_ATTENTION_QUERY_KEY } from "../lib/dashboard/hooks";
import type { PaymentItem } from "../lib/finance/types";

function AdminDashboard() {
  const queryClient = useQueryClient();
  const [isPaymentOpen, setIsPaymentOpen] = useState<boolean>(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [recordedPayment, setRecordedPayment] = useState<PaymentItem | null>(null);

  const openPayment = (request: PaymentRequest | null): void => {
    setPaymentRequest(request);
    setIsPaymentOpen(true);
  };

  return (
    <PageContainer>
      <GreetingBanner onAcceptPayment={() => openPayment(null)} />
      <PaymentCompletion payment={recordedPayment} />
      <StatsRow />
      <TodayLessons showMentor />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <AttentionList onPay={openPayment} />
        <ActivityFeed />
      </div>
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={(payment: PaymentItem) => {
          setRecordedPayment(payment);
          void queryClient.invalidateQueries({ queryKey: DASHBOARD_ATTENTION_QUERY_KEY });
        }}
        defaultStudentId={paymentRequest?.studentId}
        defaultStudentName={paymentRequest?.studentName}
        defaultCourseId={paymentRequest?.courseId}
      />
    </PageContainer>
  );
}

export function Dashboard() {
  const role = useAuthStore((s) => s.role);

  if (role === "accountant") return <AccountantDashboard />;
  if (role === "mentor") return <MentorDashboard />;
  if (role === "student") return <StudentDashboard />;
  return <AdminDashboard />;
}
