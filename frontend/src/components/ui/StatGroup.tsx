import { createContext, useContext, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyValue } from "./EmptyValue";

const CompactStatContext = createContext<boolean>(false);

interface StatGroupProps {
  children: ReactNode;
  compact?: boolean;
}

export function StatGroup({ children, compact = false }: StatGroupProps) {
  const layout: string = compact
    ? "flex divide-x divide-border [&>*]:flex-1"
    : "grid grid-cols-2 divide-x divide-y divide-border lg:flex lg:divide-y-0 lg:[&>*]:flex-1";
  return (
    <CompactStatContext.Provider value={compact}>
      <dl data-stat-group data-compact={compact ? "true" : undefined} className={`${layout} overflow-hidden rounded-2xl border border-border bg-card [&>*]:min-w-0`}>
        {children}
      </dl>
    </CompactStatContext.Provider>
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
  const compact: boolean = useContext(CompactStatContext);
  const isMissing: boolean = value === null || value === undefined || value === "";
  return (
    <div data-stat-tile className={compact ? "flex flex-col gap-0.5 px-3 py-2 sm:px-4" : "flex flex-col gap-1 px-4 py-3"}>
      <dt className={compact ? "text-xs text-muted sm:text-sm" : "text-sm text-muted"}>{label}</dt>
      <dd className="m-0 flex flex-wrap items-baseline gap-x-2">
        {isMissing ? (
          <span data-stat-missing className={`inline-flex items-center gap-1 ${compact ? "text-xl sm:text-2xl" : "text-2xl"} font-semibold text-muted`}>
            <EmptyValue reason={missingHint ?? t("missing")} />
          </span>
        ) : (
          <span className={`${compact ? "text-xl sm:text-2xl" : "text-2xl"} font-semibold text-ink tabular-nums`}>{value}</span>
        )}
        {hint !== undefined && !isMissing && <span className="text-sm text-muted tabular-nums">{hint}</span>}
      </dd>
    </div>
  );
}
