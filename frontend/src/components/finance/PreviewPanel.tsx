import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";

interface PreviewPanelProps {
  headingId: string;
  title: string;
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

export function PreviewPanel({ headingId, title, loadingLabel, errorLabel, emptyLabel, footerLabel, footerAriaLabel, isPending, isError, hasData, isFetching, isEmpty, rowCount, onRetry, onFooter, children }: PreviewPanelProps) {
  const { t } = useTranslation(["finance", "common"]);
  const showError: boolean = !hasData && isError;
  const showRefreshFailure: boolean = hasData && isError;
  return (
    <div aria-labelledby={headingId} role="region" className="min-w-0">
      <SectionCard
        title={title}
        actions={
          <button
            type="button"
            aria-label={footerAriaLabel}
            onClick={onFooter}
            className="inline-flex min-h-11 items-center text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {footerLabel}
          </button>
        }
      >
        <span id={headingId} className="sr-only">{title}</span>
        {showRefreshFailure && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <p>{t("finance:refreshFailed")}</p>
            <Button variant="secondary" loading={isFetching} onClick={onRetry}>{t("common:retry")}</Button>
          </div>
        )}
        {isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{loadingLabel}</span>
            <ul aria-hidden="true" className="flex flex-col motion-safe:animate-pulse">
              {Array.from({ length: rowCount }, (_, index) => (
                <li key={index} className="flex items-center justify-between gap-4 px-3 py-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-40 max-w-full rounded bg-border" />
                    <div className="h-3 w-28 max-w-full rounded bg-border" />
                  </div>
                  <div className="h-4 w-20 rounded bg-border" />
                </li>
              ))}
            </ul>
          </div>
        ) : showError ? (
          <ErrorState message={errorLabel} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState title={emptyLabel} />
        ) : (
          <ul className="flex flex-col">{children}</ul>
        )}
      </SectionCard>
    </div>
  );
}
