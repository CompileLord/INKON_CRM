import { useState } from "react";
import { TrendingUp, AlertCircle, Plus, Wallet, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PaymentModal } from "../finance/PaymentModal";
import { useFinanceAnalytics, usePayments } from "../../lib/finance/hooks";
import { formatSum } from "../../lib/money";
import { formatTime } from "../../i18n/formatters";
import { CardSkeleton } from "../ui/CardSkeleton";

export function AccountantDashboard() {
  const { t, i18n } = useTranslation(["dashboard", "finance", "common"]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError, refetch: refetchAnalytics } = useFinanceAnalytics();
  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError, refetch: refetchPayments } = usePayments(1, 5);
  const recentPayments = paymentsData?.items ?? [];
  const loading = analyticsLoading || paymentsLoading;
  const isError = analyticsError || paymentsError;

  const loadData = () => {
    refetchAnalytics();
    refetchPayments();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Accountant Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-emerald-800 to-teal-900 p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm mb-2">
              {t("accountantCabinet")}
            </span>
            <h2 className="text-2xl font-bold">{t("financialOverview")}</h2>
            <p className="text-xs text-emerald-100 mt-1">{t("financialSubtitle")}</p>
          </div>
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white dark:bg-emerald-950 dark:text-emerald-100 dark:hover:bg-emerald-900 px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-sm hover:bg-emerald-50 transition-colors"
          >
            <Plus size={16} /> {t("acceptPayment")}
          </button>
        </div>
      </div>

      {/* Financial Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("finance:analytics.totalReceivable")}</span>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/60 p-2 text-blue-600 dark:text-blue-400">
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-ink">
            {formatSum(analytics?.net_receivable ?? 0)} <span className="text-xs font-normal text-muted">TJS</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("finance:analytics.totalCollected")}</span>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-2 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-ink">
            {formatSum(analytics?.collected_in_period ?? 0)} <span className="text-xs font-normal text-muted">TJS</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("totalDebtors")}</span>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 p-2 text-rose-600 dark:text-rose-400">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-600 dark:text-rose-400">{analytics?.unpaid_students_count ?? 0}</div>
        </div>
      </div>

      {/* Recent Accountant Operations */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h3 className="text-sm font-bold text-ink mb-4">{t("recentPayments")}</h3>
        {loading ? (
          <CardSkeleton rows={3} />
        ) : isError ? (
          <div className="py-6 text-center text-xs">
            <p className="text-rose-600 font-semibold">{t("errorLoading", "Ошибка загрузки платежей")}</p>
            <button
              onClick={loadData}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              <RefreshCw size={12} /> {t("common:retry", "Повторить")}
            </button>
          </div>
        ) : recentPayments.length === 0 ? (
          <p className="text-xs text-muted">{t("noOperations")}</p>
        ) : (
          <div className="space-y-3 text-xs">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-cream/40 p-3">
                <div>
                  <span className="font-bold text-ink">
                    {t("finance:analytics.studentNumber", { id: p.student_id, defaultValue: `Student #${p.student_id}` })}
                  </span>
                  <p className="text-muted">
                    {p.allocations.length > 0
                      ? p.allocations.map((a) => a.course_title).join(", ")
                      : t("finance:analytics.unapplied", "Не распределён")}{" "}
                    • {t(`common:enums.paymentMethod.${p.method}`, p.method ?? "")}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-emerald-700">+{formatSum(p.amount)} TJS</span>
                  <p className="text-[10px] text-muted">{formatTime(p.created_at, i18n.language)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} onSuccess={loadData} />
    </div>
  );
}
