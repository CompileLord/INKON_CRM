import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import { formatSum } from "../../lib/money";
import { CardSkeleton } from "../ui/CardSkeleton";

export function AttentionList() {
  const { t } = useTranslation("dashboard");
  const { data, isLoading, isError, refetch } = useDebts(1, 5);
  const debts = data?.items ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border-warm bg-card">
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border-warm bg-strip px-5 py-3.5">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-[15px] font-semibold text-ink">{t("attentionToday")}</h3>
      </div>

      <div className="flex-1 p-4">
        {isLoading ? (
          <CardSkeleton rows={3} />
        ) : isError ? (
          <div className="py-6 text-center text-xs">
            <p className="text-rose-600 font-semibold">{t("errorLoading", "Ошибка загрузки должников")}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream"
            >
              <RefreshCw size={12} /> {t("common:retry", "Повторить")}
            </button>
          </div>
        ) : debts.length === 0 ? (
          <p className="px-1 text-xs text-muted">{t("allPaymentsOnTime")}</p>
        ) : (
          <ul className="divide-y divide-beige">
            {debts.map((item) => (
              <li key={`${item.student.id}-${item.course.id}`} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={[
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    item.overdue_days > 15 ? "bg-red-600" : "bg-amber-500",
                  ].join(" ")}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">
                      {item.student.first_name} {item.student.last_name}
                    </p>
                    <span className="text-xs font-bold text-rose-600">{formatSum(item.debt)} TJS</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {item.course.title} • {t("overdueDays", { days: item.overdue_days })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-beige px-5 py-3.5">
        <Link
          to="/finance"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 no-underline hover:underline"
        >
          {t("viewAllDebts")} <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
