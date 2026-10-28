import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { FinanceUrlState, type CollectionRange } from "../../lib/finance/urlState";
import { formatExactMoney } from "../../lib/money";
import { formatNumber } from "../../i18n/formatters";
import { Button } from "../ui/Button";
import { StatGroup, StatTile } from "../ui/StatGroup";
import { CollectionRangePicker } from "./CollectionRangePicker";

interface OverviewSummaryProps {
  range: CollectionRange | null;
  onApplyRange: (range: CollectionRange) => void;
}

interface AnalyticsQuery {
  isPending: boolean;
  isError: boolean;
  data: unknown;
  refetch: () => Promise<unknown>;
}

function MetricStatus({ query }: { query: AnalyticsQuery }) {
  const { t } = useTranslation(["finance", "common"]);
  if (query.isPending) {
    return (
      <span role="status" aria-busy="true" className="block h-8 w-28 rounded bg-border motion-safe:animate-pulse">
        <span className="sr-only">{t("common:loading")}</span>
      </span>
    );
  }
  return (
    <span role="alert" className="flex flex-col items-start gap-2">
      <span className="text-sm font-normal text-destructive">{t("finance:unavailable")}</span>
      <Button variant="secondary" onClick={() => void query.refetch()}>{t("common:retry")}</Button>
    </span>
  );
}

export function OverviewSummary({ range, onApplyRange }: OverviewSummaryProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const effectiveRange: CollectionRange = FinanceUrlState.resolveRange(range);
  const currentRange: CollectionRange = FinanceUrlState.defaultRange();
  const current = useFinanceAnalytics(currentRange.from, currentRange.to);
  const collection = useFinanceAnalytics(effectiveRange.from, effectiveRange.to);
  const money = (amount: string): string => t("finance:moneyAmount", { amount: formatExactMoney(amount) });
  const currentUnavailable: boolean = !current.data;
  const collectionUnavailable: boolean = !collection.data;

  return (
    <section aria-label={t("finance:overview.summaryLabel")} className="flex flex-col gap-3">
      <StatGroup>
        <StatTile
          label={t("finance:overview.currentDue")}
          value={currentUnavailable ? <MetricStatus query={current} /> : money(current.data!.net_receivable)}
        />
        <StatTile
          label={t("finance:overview.currentStudents")}
          value={currentUnavailable ? <MetricStatus query={current} /> : formatNumber(current.data!.unpaid_students_count, i18n.language)}
        />
        <StatTile
          label={t("finance:overview.netCash")}
          value={
            <span className="flex flex-col items-start gap-1">
              {collectionUnavailable ? <MetricStatus query={collection} /> : money(collection.data!.collected_in_period)}
              <span className="text-base font-normal"><CollectionRangePicker range={effectiveRange} onApply={onApplyRange} /></span>
            </span>
          }
        />
      </StatGroup>
      {(current.data && current.isError) || (collection.data && collection.isError) ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {t("finance:refreshFailed")}
          <button type="button" onClick={() => { void current.refetch(); void collection.refetch(); }} className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline">
            {t("common:retry")}
          </button>
        </p>
      ) : null}
    </section>
  );
}
