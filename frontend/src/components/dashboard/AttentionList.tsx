import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import { FinanceUrlState } from "../../lib/finance/urlState";
import { formatMoney } from "../../lib/money";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { ListRow } from "../ui/ListRow";
import { SectionCard } from "../ui/SectionCard";
import { StaleNotice } from "./StaleNotice";

function AttentionSkeleton() {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-1">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-3 py-3 motion-safe:animate-pulse">
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-32 max-w-full rounded bg-border" />
            <div className="h-3 w-40 max-w-full rounded bg-border" />
          </div>
          <div className="h-4 w-20 rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

export function AttentionList() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data, isLoading, isError, refetch } = useDebts(1, 5);
  const debts = data?.items ?? [];

  return (
    <SectionCard
      title={t("attentionToday")}
      actions={<Link to={FinanceUrlState.debtorsLocation()} className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("openFinanceViewDebts")}</Link>}
    >
      {data === undefined && isLoading ? (
        <AttentionSkeleton />
      ) : data === undefined && isError ? (
        <ErrorState message={t("errorLoadingDebts")} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          {isError && <StaleNotice onRetry={() => refetch()} />}
          {debts.length === 0 ? (
            <EmptyState title={t("allPaymentsOnTime")} />
          ) : (
            <ul className="flex flex-col">
              {debts.map((item) => {
                const isOverdue: boolean = item.overdue_days > 0;
                const studentName: string = `${item.student.first_name} ${item.student.last_name}`;
                return (
                  <li key={`${item.student.id}-${item.course.id}`}>
                    <ListRow to={FinanceUrlState.debtorsLocation(item.course.id, { id: item.student.id, name: studentName })}>
                      <span className="flex min-w-0 items-center justify-between gap-4">
                        <span className="flex min-w-0 flex-col">
                          <span className="break-words text-sm font-medium text-ink">{studentName}</span>
                          <span className="break-words text-sm text-muted">
                            {item.course.title} · <span className="tabular-nums">{isOverdue ? t("overdueDays", { count: item.overdue_days }) : t("dueToday")}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${isOverdue ? "text-destructive" : "text-ink"}`}>
                          {formatMoney(item.debt, { suffix: "TJS" })}
                        </span>
                      </span>
                    </ListRow>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}
