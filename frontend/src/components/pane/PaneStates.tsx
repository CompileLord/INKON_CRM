import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";

interface PanelSkeletonProps {
  label: string;
  rows?: number;
}

export function PanelSkeleton({ label, rows = 2 }: PanelSkeletonProps) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-1">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index: number) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 motion-safe:animate-pulse">
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-40 rounded bg-strip" />
            <div className="h-3 w-24 rounded bg-strip" />
          </div>
          <div className="h-4 w-16 rounded bg-strip" />
        </div>
      ))}
    </div>
  );
}

interface PaneSkeletonProps {
  rows?: number;
}

export function PaneSkeleton({ rows = 2 }: PaneSkeletonProps) {
  const { t } = useTranslation("common");
  return <PanelSkeleton label={t("loading")} rows={rows} />;
}

interface StaleNoticeProps {
  message: string;
  onRetry: () => void;
}

export function StaleNotice({ message, onRetry }: StaleNoticeProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 text-sm text-muted">
      <span>{message}</span>
      <Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>
    </div>
  );
}

interface PaneProps {
  isLoadingInitial: boolean;
  isFailedInitial: boolean;
  isStaleFailure: boolean;
  isEmpty: boolean;
  errorMessage: string;
  staleMessage: string;
  emptyContent: ReactNode;
  skeletonRows?: number;
  onRetry: () => void;
  children: ReactNode;
}

export function Pane({ isLoadingInitial, isFailedInitial, isStaleFailure, isEmpty, errorMessage, staleMessage, emptyContent, skeletonRows, onRetry, children }: PaneProps) {
  if (isLoadingInitial) return <PaneSkeleton rows={skeletonRows} />;
  if (isFailedInitial) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  return (
    <div className="flex flex-col gap-2">
      {isEmpty ? emptyContent : children}
      {isStaleFailure && <StaleNotice message={staleMessage} onRetry={onRetry} />}
    </div>
  );
}
