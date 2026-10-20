import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { useCourses } from "../../lib/courses/hooks";
import { useStudents } from "../../lib/users/hooks";
import { formatMoney } from "../../lib/money";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { SummaryValue } from "./SummaryValue";
import { StaleNotice } from "./StaleNotice";

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
      <StatGroup>
        <StatTile
          label={t("paymentDebt")}
          value={<SummaryValue query={finance} render={(data) => formatMoney(data.net_receivable, { suffix: "TJS" })} />}
          hint={finance.data === undefined ? undefined : t("debtors", { count: finance.data.unpaid_students_count })}
        />
        <StatTile
          label={t("activeCourses")}
          value={<SummaryValue query={courses} render={(data) => data.total} />}
        />
        <StatTile
          label={t("registeredStudents")}
          value={<SummaryValue query={students} render={(data) => data.total} />}
        />
      </StatGroup>
      {staleRefetchers.length > 0 && <StaleNotice onRetry={() => staleRefetchers.forEach((refetch) => refetch())} />}
    </section>
  );
}
