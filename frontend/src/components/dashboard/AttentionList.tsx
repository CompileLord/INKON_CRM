import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import { FinanceUrlState } from "../../lib/finance/urlState";
import { formatMoney } from "../../lib/money";

export function AttentionList() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useDebts(1, 5);
  const debts = data?.items ?? [];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border-warm bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-warm bg-strip px-5 py-3.5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning shrink-0" aria-hidden="true" />
          <h2 className="text-lg font-semibold leading-[26px] text-ink">
            {t("attentionToday")}
          </h2>
        </div>
      </div>

      <div className="flex-1 p-4">
        {data === undefined && isLoading ? (
          <div className="flex flex-col divide-y divide-border-warm motion-safe:animate-pulse">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="py-3 px-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0 max-w-full">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-strip" />
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className="h-4 w-32 rounded bg-strip max-w-full" />
                    <div className="h-3 w-20 rounded bg-strip max-w-full" />
                    <div className="h-3 w-40 rounded bg-strip max-w-full" />
                  </div>
                </div>
                <div className="flex items-center justify-end pl-4.5 sm:pl-0 shrink-0">
                  <div className="h-[44px] w-full sm:w-24 rounded-lg bg-strip" />
                </div>
              </div>
            ))}
          </div>
        ) : data === undefined && isError ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
            <p className="text-xs font-semibold text-destructive">
              {t("errorLoadingDebts")}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
            >
              <RefreshCw size={13} aria-hidden="true" />
              <span>{t("common:retry")}</span>
            </button>
          </div>
        ) : debts.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-3">
            {isError && (
              <div className="w-full mb-2 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5 text-left">
                <span className="text-xs font-medium text-warning">
                  {t("staleFailedNotice")}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
            <p className="text-xs text-muted">
              {t("allPaymentsOnTime")}
            </p>
          </div>
        ) : (
          <div>
            {isError && (
              <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5">
                <span className="text-xs font-medium text-warning">
                  {t("staleFailedNotice")}
                </span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  <span>{t("common:retry")}</span>
                </button>
              </div>
            )}
            <ul className="divide-y divide-border-warm">
              {debts.map((item) => {
                const isOverdue = item.overdue_days > 0;
                const isCritical = item.overdue_days > 15;
                const dotColor = isCritical
                  ? "bg-destructive"
                  : isOverdue
                  ? "bg-warning"
                  : "bg-muted";

                return (
                  <li key={`${item.student.id}-${item.course.id}`} className="py-3 px-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-medium text-ink break-words">
                              {item.student.first_name} {item.student.last_name}
                            </p>
                            <span
                              className={`text-xs tabular-nums whitespace-nowrap ${
                                isOverdue ? "font-bold text-destructive" : "font-semibold text-ink"
                              }`}
                            >
                              {formatMoney(item.debt, { suffix: "TJS" })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted break-words">
                            {item.course.title} •{" "}
                            <span className="tabular-nums">
                              {isOverdue ? t("overdueDays", { count: item.overdue_days }) : t("dueToday")}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end pl-4.5 sm:pl-0 shrink-0">
                        <Link
                          to={FinanceUrlState.debtorsLocation(item.course.id, { id: item.student.id, name: `${item.student.first_name} ${item.student.last_name}` })}
                          className="inline-flex min-h-[44px] min-w-[44px] w-full sm:w-auto items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                        >
                          <span>{t("viewStudentBalance")}<span className="sr-only"> {item.student.first_name} {item.student.last_name}, {item.course.title}</span></span>
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-border-warm bg-card px-5 py-2">
        <Link
          to={FinanceUrlState.debtorsLocation()}
          className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-info [@media(hover:hover)_and_(pointer:fine)]:hover:underline motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
        >
          <span>{t("openFinanceViewDebts")}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
