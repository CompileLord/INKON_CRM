import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Button } from "../ui/Button";

interface PreviewPanelProps {
  headingId: string;
  title: string;
  info: string;
  scope: string | null;
  icon: ReactNode;
  loadingLabel: string;
  errorLabel: string;
  emptyLabel: string;
  footerLabel: string;
  footerAriaLabel?: string;
  isPending: boolean;
  isError: boolean;
  hasData: boolean;
  isFetching: boolean;
  isEmpty: boolean;
  rowCount: number;
  onRetry: () => void;
  onFooter: () => void;
  children: ReactNode;
}

export function PreviewPanel({
  headingId,
  title,
  info,
  scope,
  icon,
  loadingLabel,
  errorLabel,
  emptyLabel,
  footerLabel,
  footerAriaLabel,
  isPending,
  isError,
  hasData,
  isFetching,
  isEmpty,
  rowCount,
  onRetry,
  onFooter,
  children,
}: PreviewPanelProps) {
  const { t } = useTranslation(["finance", "common"]);
  const showSkeleton: boolean = isPending;
  const showError: boolean = !hasData && isError;
  const showRefreshFailure: boolean = hasData && isError;
  return (
    <section aria-labelledby={headingId} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
          {icon}
          <span id={headingId}>{title}</span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label: title })}>{info}</InfoTooltip>
          {scope && <span className="rounded-full bg-strip px-2 py-0.5 text-xs font-normal text-label">{scope}</span>}
        </h2>
      </div>
      {showRefreshFailure && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-surface px-4 py-2 text-sm text-warning">
          <p>{t("finance:refreshFailed")}</p>
          <Button variant="secondary" loading={isFetching} onClick={onRetry}>
            {t("common:retry")}
          </Button>
        </div>
      )}
      {showSkeleton ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{loadingLabel}</span>
          <ul aria-hidden="true" className="@container divide-y divide-border motion-safe:animate-pulse">
            {Array.from({ length: rowCount }, (_, index) => (
              <li key={index} className="h-[7.5rem] px-4 py-3 @[30rem]:h-[6.5rem]">
                <div className="h-full rounded-lg bg-strip" />
              </li>
            ))}
          </ul>
        </div>
      ) : showError ? (
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">{errorLabel}</p>
          <Button variant="secondary" loading={isFetching} onClick={onRetry}>
            {t("common:retry")}
          </Button>
        </div>
      ) : isEmpty ? (
        <p className="p-4 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="@container divide-y divide-border">{children}</ul>
      )}
      <div className="border-t border-border px-4 py-1">
        <button
          type="button"
          aria-label={footerAriaLabel}
          onClick={onFooter}
          className="min-h-11 rounded-[10px] px-1 text-sm font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]"
        >
          <span className="inline-flex items-center gap-1">
            {footerLabel}
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        </button>
      </div>
    </section>
  );
}
