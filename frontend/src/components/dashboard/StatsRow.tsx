import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { useCourses } from "../../lib/courses/hooks";
import { useStudents } from "../../lib/users/hooks";
import { FinanceUrlState } from "../../lib/finance/urlState";
import { formatMoney } from "../../lib/money";
import { SummaryValue } from "./SummaryValue";
import { StaleNotice } from "./StaleNotice";

interface LinkedStatTileProps {
  to: string;
  label: string;
  value: ReactNode;
  hint?: string;
}

function LinkedStatTile({ to, label, value, hint }: LinkedStatTileProps) {
  return (
    <li className="min-w-0">
      <Link
        to={to}
        data-stat-tile
        className="flex h-full flex-col gap-1 px-4 py-3 hover:bg-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
      >
        <span className="text-sm text-muted">{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold text-ink tabular-nums">{value}</span>
          {hint !== undefined && <span className="text-sm text-muted tabular-nums">{hint}</span>}
        </span>
      </Link>
    </li>
  );
}

export function StatsRow() {
  const { t } = useTranslation(["dashboard", "common"]);
  const finance = useFinanceAnalytics();
  const courses = useCourses({ status: "active" });
  const students = useStudents({ page: 1, page_size: 1 });
  const staleRefetchers: (() => unknown)[] = [finance, courses, students]
    .filter((query) => query.isError && query.data !== undefined)
    .map((query) => query.refetch);

  return (
    <section aria-labelledby="dashboard-summary-heading" className="flex flex-col gap-3">
      <h2 id="dashboard-summary-heading" className="sr-only">{t("summaryTitle")}</h2>
      <ul data-stat-group className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <LinkedStatTile
          to={FinanceUrlState.debtorsLocation()}
          label={t("paymentDebt")}
          value={<SummaryValue query={finance} render={(data) => formatMoney(data.net_receivable, { suffix: "TJS" })} />}
          hint={finance.data === undefined ? undefined : t("debtors", { count: finance.data.unpaid_students_count })}
        />
        <LinkedStatTile
          to="/courses"
          label={t("activeCourses")}
          value={<SummaryValue query={courses} render={(data) => data.total} />}
        />
        <LinkedStatTile
          to="/students"
          label={t("registeredStudents")}
          value={<SummaryValue query={students} render={(data) => data.total} />}
        />
      </ul>
      {staleRefetchers.length > 0 && <StaleNotice onRetry={() => staleRefetchers.forEach((refetch) => refetch())} />}
    </section>
  );
}
