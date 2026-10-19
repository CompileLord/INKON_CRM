import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "./InfoTooltip";

interface StatGroupProps {
  children: ReactNode;
}

export function StatGroup({ children }: StatGroupProps) {
  return (
    <dl data-stat-group className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card lg:flex lg:divide-y-0 [&>*]:min-w-0 lg:[&>*]:flex-1">
      {children}
    </dl>
  );
}

interface StatTileProps {
  label: string;
  value: ReactNode | null | undefined;
  hint?: string;
  missingHint?: string;
}

export function StatTile({ label, value, hint, missingHint }: StatTileProps) {
  const { t } = useTranslation("ui");
  const isMissing: boolean = value === null || value === undefined || value === "";
  return (
    <div data-stat-tile className="flex flex-col gap-1 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="m-0 flex flex-wrap items-baseline gap-x-2">
        {isMissing ? (
          <span data-stat-missing className="inline-flex items-center gap-1 text-2xl font-semibold text-muted">
            <span aria-label={t("missing")}>—</span>
            {missingHint !== undefined && <InfoTooltip label={missingHint}>{missingHint}</InfoTooltip>}
          </span>
        ) : (
          <span className="text-2xl font-semibold text-ink tabular-nums">{value}</span>
        )}
        {hint !== undefined && !isMissing && <span className="text-sm text-muted tabular-nums">{hint}</span>}
      </dd>
    </div>
  );
}
