import { useState } from "react";
import { AlertTriangle, DollarSign, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import type { DebtItem } from "../../lib/finance/types";
import { formatSum } from "../../lib/money";
import { PaymentModal } from "./PaymentModal";
import { Pagination } from "../ui/Pagination";
import { TableSkeletonRows } from "../ui/TableSkeletonRows";
import { TableErrorState } from "../ui/TableErrorState";

interface SelectedDebt {
  studentId: number;
  studentName: string;
  courseId: number;
  courseName: string;
}

export function DebtorsTab() {
  const { t } = useTranslation(["finance", "common"]);
  const [page, setPage] = useState<number>(1);
  const { data, isLoading, isError, refetch } = useDebts(page);
  const debts = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const [selectedDebt, setSelectedDebt] = useState<SelectedDebt | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const handleOpenPayment = (debt: DebtItem) => {
    setSelectedDebt({
      studentId: debt.student.id,
      studentName: `${debt.student.first_name} ${debt.student.last_name}`,
      courseId: debt.course.id,
      courseName: debt.course.title,
    });
    setIsPaymentModalOpen(true);
  };

  const filteredDebts = debts.filter((d) => {
    const studentName = `${d.student.first_name} ${d.student.last_name}`.toLowerCase();
    return studentName.includes(searchQuery.toLowerCase()) || d.course.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} /> {t("debtors.title")}
          </h3>
          <p className="text-xs text-muted">{t("debtors.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder={t("common:search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-maroon focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Debtors Table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted uppercase">
                <th className="pb-3 font-semibold">{t("debtors.table.student")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.course")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.priceAtEnrollment")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.totalPaid")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.debtAmount")}</th>
                <th className="pb-3 font-semibold">{t("debtors.table.overdue")}</th>
                <th className="pb-3 font-semibold text-right">{t("common:actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-ink">
              {isLoading ? (
                <TableSkeletonRows columns={7} rows={5} />
              ) : isError ? (
                <TableErrorState columns={7} onRetry={() => refetch()} />
              ) : filteredDebts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    {t("common:noData")}
                  </td>
                </tr>
              ) : (
                filteredDebts.map((d) => (
                  <tr key={`${d.student.id}-${d.course.id}`} className="hover:bg-cream/40 transition-colors">
                    <td className="py-3.5 font-bold text-ink">
                      {d.student.first_name} {d.student.last_name}
                    </td>
                    <td className="py-3.5 text-muted">{d.course.title}</td>
                    <td className="py-3.5 text-muted">{formatSum(d.price_at_enrollment)} TJS</td>
                    <td className="py-3.5 text-muted">{formatSum(d.total_paid)} TJS</td>
                    <td className="py-3.5 font-bold text-rose-600">{formatSum(d.debt)} TJS</td>
                    <td className="py-3.5">
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                        {t("overdueDaysCount", { count: d.overdue_days, defaultValue: `${d.overdue_days} дн.` })}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => handleOpenPayment(d)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs ml-auto"
                      >
                        <DollarSign size={13} /> {t("paymentModal.acceptPayment")}
                      </button>
                    </td>
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

      {selectedDebt && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedDebt(null);
          }}
          onSuccess={() => refetch()}
          defaultStudentId={selectedDebt.studentId}
          defaultStudentName={selectedDebt.studentName}
          defaultCourseId={selectedDebt.courseId}
          defaultCourseName={selectedDebt.courseName}
        />
      )}
    </div>
  );
}
