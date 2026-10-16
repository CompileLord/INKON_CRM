import { BookOpen, Users, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { useCourses } from "../../lib/courses/hooks";
import { useStudents } from "../../lib/users/hooks";
import { formatMoney } from "../../lib/money";

export function StatsRow() {
  const { t } = useTranslation(["dashboard", "common"]);

  const {
    data: financeData,
    isLoading: financeLoading,
    isError: financeError,
    refetch: refetchFinance,
  } = useFinanceAnalytics();

  const {
    data: coursesData,
    isLoading: coursesLoading,
    isError: coursesError,
    refetch: refetchCourses,
  } = useCourses({ status: "active" });

  const {
    data: studentsData,
    isLoading: studentsLoading,
    isError: studentsError,
    refetch: refetchStudents,
  } = useStudents({ page: 1, page_size: 1 });

  return (
    <section aria-labelledby="dashboard-summary-heading" className="rounded-xl border border-border-warm bg-card overflow-hidden">
      <h2 id="dashboard-summary-heading" className="sr-only">
        {t("summaryTitle")}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1 p-4 flex flex-col justify-between border-b md:border-b-0 md:border-r border-border-warm">
          {financeLoading && !financeData ? (
            <div className="flex flex-col justify-between gap-3 motion-safe:animate-pulse">
              <div className="h-4 w-28 rounded bg-strip" />
              <div className="h-8 w-40 rounded bg-strip" />
              <div className="h-4 w-24 rounded bg-strip" />
            </div>
          ) : financeError && !financeData ? (
            <div className="flex flex-col justify-center items-start gap-2 py-1">
              <span className="text-xs font-medium text-destructive">
                {t("errorLoadingSummary")}
              </span>
              <button
                type="button"
                onClick={() => refetchFinance()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{t("common:retry")}</span>
              </button>
            </div>
          ) : (
            <div>
              <span className="text-sm font-medium text-muted flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-warning shrink-0" aria-hidden="true" />
                <span>{t("paymentDebt")}</span>
              </span>
              <p className="text-[28px] font-bold leading-none text-ink tabular-nums mt-2">
                {formatMoney(financeData?.net_receivable ?? "0", { suffix: "TJS" })}
              </p>
              <div className="mt-2.5">
                <span className="inline-flex items-center rounded-full bg-danger-surface px-2.5 py-0.5 text-xs font-semibold text-destructive ring-1 ring-black/5 dark:ring-white/10 tabular-nums">
                  {t("debtors", { count: financeData?.unpaid_students_count ?? 0 })}
                </span>
              </div>
              {financeError && financeData && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5">
                  <span className="text-xs font-medium text-warning">
                    {t("staleFailedNotice")}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchFinance()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>{t("common:retry")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-span-1 md:col-span-1 p-4 flex flex-col justify-between border-r border-border-warm">
          {coursesLoading && !coursesData ? (
            <div className="flex flex-col justify-between gap-3 motion-safe:animate-pulse">
              <div className="h-5 w-5 rounded bg-strip" />
              <div className="h-8 w-28 rounded bg-strip" />
              <div className="h-4 w-32 rounded bg-strip" />
            </div>
          ) : coursesError && !coursesData ? (
            <div className="flex flex-col justify-center items-start gap-2 py-1">
              <span className="text-xs font-medium text-destructive">
                {t("errorLoadingSummary")}
              </span>
              <button
                type="button"
                onClick={() => refetchCourses()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{t("common:retry")}</span>
              </button>
            </div>
          ) : (
            <div>
              <BookOpen size={20} className="text-maroon shrink-0" strokeWidth={2} aria-hidden="true" />
              <p className="text-[28px] font-bold leading-none text-ink tabular-nums mt-2">
                {coursesData?.total ?? 0}
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {t("activeCourses")}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t("activeCoursesSubtitle")}
              </p>
              {coursesError && coursesData && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5">
                  <span className="text-xs font-medium text-warning">
                    {t("staleFailedNotice")}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchCourses()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>{t("common:retry")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-span-1 md:col-span-1 p-4 flex flex-col justify-between">
          {studentsLoading && !studentsData ? (
            <div className="flex flex-col justify-between gap-3 motion-safe:animate-pulse">
              <div className="h-5 w-5 rounded bg-strip" />
              <div className="h-8 w-28 rounded bg-strip" />
              <div className="h-4 w-32 rounded bg-strip" />
            </div>
          ) : studentsError && !studentsData ? (
            <div className="flex flex-col justify-center items-start gap-2 py-1">
              <span className="text-xs font-medium text-destructive">
                {t("errorLoadingSummary")}
              </span>
              <button
                type="button"
                onClick={() => refetchStudents()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{t("common:retry")}</span>
              </button>
            </div>
          ) : (
            <div>
              <Users size={20} className="text-info shrink-0" strokeWidth={2} aria-hidden="true" />
              <p className="text-[28px] font-bold leading-none text-ink tabular-nums mt-2">
                {studentsData?.total ?? 0}
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {t("registeredStudents")}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t("registeredStudentsSubtitle")}
              </p>
              {studentsError && studentsData && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border-warm bg-strip p-2.5">
                  <span className="text-xs font-medium text-warning">
                    {t("staleFailedNotice")}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchStudents()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:active:scale-[0.96] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>{t("common:retry")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
