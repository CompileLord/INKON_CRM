import { useState } from "react";
import { TrendingUp, AlertTriangle, Users, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFinanceAnalytics, usePayments } from "../../lib/finance/hooks";
import { formatSum } from "../../lib/money";
import { formatDate } from "../../i18n/formatters";
import { PaymentModal } from "./PaymentModal";
import { Pagination } from "../ui/Pagination";
import { CardSkeleton } from "../ui/CardSkeleton";
import { TableSkeletonRows } from "../ui/TableSkeletonRows";
import { TableErrorState } from "../ui/TableErrorState";

export function FinanceAnalyticsTab() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const { data: analytics, isLoading: analyticsLoading, isError: analyticsError, refetch: refetchAnalytics } = useFinanceAnalytics();
  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError, refetch: refetchPayments } = usePayments(page, 10);
  const payments = paymentsData?.items ?? [];
  const totalPages = paymentsData?.total_pages ?? 1;

  const loadData = () => {
    refetchAnalytics();
    refetchPayments();
  };

  const getMethodLabel = (method?: string) =>
    method ? t(`common:enums.paymentMethod.${method}`, method) : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-ink">{t("analytics.title")}</h3>
          <p className="text-xs text-muted">{t("analytics.subtitle")}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-maroon px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-maroon/90"
        >
          <Plus size={15} /> {t("paymentModal.acceptPayment")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("analytics.totalReceivable")}</span>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/60 p-2 text-blue-600 dark:text-blue-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-ink">
            {analyticsLoading ? "..." : `${formatSum(analytics?.net_receivable ?? 0)} TJS`}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("analytics.totalCollected")}</span>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-2 text-emerald-600 dark:text-emerald-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-ink">
            {analyticsLoading ? "..." : `${formatSum(analytics?.collected_in_period ?? 0)} TJS`}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold">{t("analytics.unpaidStudentsCount")}</span>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-ink">
            {analyticsLoading ? "..." : (analytics?.unpaid_students_count ?? 0)}
          </div>
        </div>
      </div>

      {/* Top debtors preview */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h4 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
          <Users size={16} className="text-maroon" /> {t("analytics.topDebtors")}
        </h4>
        {analyticsLoading ? (
          <CardSkeleton rows={2} />
        ) : analyticsError ? (
          <div className="py-4 text-center text-xs">
            <p className="text-rose-600 font-semibold">{t("errorLoading", "Ошибка загрузки аналитики")}</p>
            <button
              onClick={() => refetchAnalytics()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              <RefreshCw size={12} /> {t("common:retry", "Повторить")}
            </button>
          </div>
        ) : (analytics?.debtors_preview.length ?? 0) === 0 ? (
          <p className="text-xs text-muted">{t("common:noData")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {analytics?.debtors_preview.map((d) => (
              <div
                key={d.student_id}
                className="flex items-center justify-between rounded-xl border border-border bg-cream/40 p-3 text-xs"
              >
                <span className="font-semibold text-ink">
                  {d.first_name} {d.last_name}
                </span>
                <span className="font-bold text-rose-600 dark:text-rose-400">{formatSum(d.debt)} TJS</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Payments Table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-ink">{t("analytics.recentTransactions")}</h4>
          <span className="text-xs text-muted">
            {t("common:total")}: {paymentsData?.total ?? 0}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted uppercase">
                <th className="pb-3 font-semibold">ID</th>
                <th className="pb-3 font-semibold">{t("debtors.table.student")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.course")}</th>
                <th className="pb-3 font-semibold">{t("paymentModal.amount")}</th>
                <th className="pb-3 font-semibold">{t("paymentModal.method")}</th>
                <th className="pb-3 font-semibold">{t("paymentModal.date")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-ink">
              {paymentsLoading ? (
                <TableSkeletonRows columns={6} rows={5} />
              ) : paymentsError ? (
                <TableErrorState columns={6} onRetry={() => refetchPayments()} />
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted">
                    {t("common:noData")}
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-cream/40 transition-colors">
                    <td className="py-3.5 font-mono font-medium text-muted">#{p.id}</td>
                    <td className="py-3.5 font-semibold text-ink">
                      {t("analytics.studentNumber", { id: p.student_id, defaultValue: `Student #${p.student_id}` })}
                    </td>
                    <td className="py-3.5 text-muted">
                      {p.allocations.length > 0
                        ? p.allocations.map((a) => a.course_title).join(", ")
                        : t("analytics.unapplied", "Не распределён")}
                    </td>
                    <td className="py-3.5 font-bold text-emerald-700 dark:text-emerald-400">{formatSum(p.amount)} TJS</td>
                    <td className="py-3.5">{getMethodLabel(p.method ?? undefined)}</td>
                    <td className="py-3.5 text-muted">{formatDate(p.paid_at, i18n.language)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex justify-end border-t border-border/50 pt-4">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <PaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={loadData} />
    </div>
  );
}
