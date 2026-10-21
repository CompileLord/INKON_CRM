import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

export interface SummaryQuery<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface SummaryValueProps<TData> {
  query: SummaryQuery<TData>;
  render: (data: TData) => ReactNode;
}

export function SummaryValue<TData>({ query, render }: SummaryValueProps<TData>) {
  const { t } = useTranslation(["dashboard", "common"]);
  if (query.data === undefined && query.isLoading) {
    return <span role="status" aria-busy="true" className="block h-8 w-24 rounded bg-border motion-safe:animate-pulse"><span className="sr-only">{t("common:loading")}</span></span>;
  }
  if (query.data === undefined) {
    return (
      <span role="alert" className="flex flex-col items-start gap-2">
        <span className="text-sm font-normal text-destructive">{t("dashboard:errorLoadingSummary")}</span>
        <Button type="button" variant="secondary" onClick={() => query.refetch()}>{t("common:retry")}</Button>
      </span>
    );
  }
  return <>{render(query.data)}</>;
}
