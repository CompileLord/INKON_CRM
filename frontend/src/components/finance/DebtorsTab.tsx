import { useEffect } from "react";
import { Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import { FinanceUrlState, type DebtorsViewState } from "../../lib/finance/urlState";
import type { DebtItem } from "../../lib/finance/types";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";
import { CourseBalanceIdentity } from "../../lib/finance/courseBalanceIdentity";
import { CourseBalanceRow } from "./CourseBalanceRow";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;

interface DebtorsTabProps {
  view: DebtorsViewState;
  onPageChange: (page: number) => void;
  onClearCourse: () => void;
  onAcceptPayment: (debt: DebtItem) => void;
}

export function DebtorsTab({ view, onPageChange, onClearCourse, onAcceptPayment }: DebtorsTabProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const debts = useDebts(view.page, PAGE_SIZE, FinanceUrlState.debtFilters(view));
  const totalPages: number = debts.data?.total_pages ?? 1;
  const lastValidPage: number = Math.max(1, totalPages);
  const ambiguousStudents: Set<number> = CourseBalanceIdentity.studentIdsSharingAName(debts.data?.items ?? []);
  const courseTitle: string | undefined = debts.data?.items.find((debt) => debt.course.id === view.courseId)?.course.title;

  useEffect(() => {
    if (debts.data && view.page > lastValidPage) onPageChange(lastValidPage);
  }, [debts.data, view.page, lastValidPage, onPageChange]);

  return (
    <section aria-labelledby="finance-debtors-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Users size={18} aria-hidden="true" />
          <span id="finance-debtors-heading">{t("finance:debtors.title")}</span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("finance:debtors.title") })}>{t("finance:debtors.info")}</InfoTooltip>
        </h2>
        {view.courseId !== null && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-11 items-center gap-1 rounded-[10px] bg-beige pl-3 text-sm text-ink">
              <span className="break-words tabular-nums">
                {t("finance:debtorsFilter.courseDebts", {
                  course: courseTitle ?? t("finance:analytics.courseNumber", { id: formatNumber(view.courseId, i18n.language) }),
                })}
              </span>
              <button
                type="button"
                aria-label={t("finance:debtorsFilter.clearLabel")}
                onClick={onClearCourse}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={16} aria-hidden="true" />
                <span className="sr-only">{t("finance:debtorsFilter.clear")}</span>
              </button>
            </span>
          </div>
        )}
      </div>
      {debts.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("finance:courseBalances.loading")}</span>
          <ul aria-hidden="true" className="@container divide-y divide-border motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className="h-[7.5rem] px-4 py-3 @[30rem]:h-[6.5rem]">
                <div className="h-full rounded-lg bg-strip" />
              </li>
            ))}
          </ul>
        </div>
      ) : !debts.data ? (
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">{t("finance:debtorsTab.error")}</p>
          <Button variant="secondary" loading={debts.isFetching} onClick={() => void debts.refetch()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : debts.data.items.length === 0 ? (
        <p className="p-4 text-sm text-muted">{t("finance:debtorsTab.empty")}</p>
      ) : (
        <>
          {debts.isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-surface px-4 py-2 text-sm text-warning">
              <p>{t("finance:refreshFailed")}</p>
              <Button variant="secondary" loading={debts.isFetching} onClick={() => void debts.refetch()}>
                {t("common:retry")}
              </Button>
            </div>
          )}
          <ul className="@container divide-y divide-border">
            {debts.data.items.map((debt) => (
              <CourseBalanceRow key={`${debt.student.id}-${debt.course.id}`} debt={debt} showStudentNumber={ambiguousStudents.has(debt.student.id)} onAcceptPayment={onAcceptPayment} />
            ))}
          </ul>
        </>
      )}
      {totalPages > 1 && (
        <div className="flex justify-end border-t border-border p-3">
          <Pagination page={view.page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </section>
  );
}
