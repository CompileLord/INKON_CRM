import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";

interface MentorPaneSkeletonProps {
  rows?: number;
}

export function MentorPaneSkeleton({ rows = 2 }: MentorPaneSkeletonProps) {
  const { t } = useTranslation("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-1">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: rows }, (_, index: number) => (
        <div key={index} className="flex items-center gap-3 px-3 py-3 motion-safe:animate-pulse">
          <div className="h-4 w-24 rounded bg-strip" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-40 rounded bg-strip" />
            <div className="h-3 w-24 rounded bg-strip" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface MentorStaleNoticeProps {
  message: string;
  onRetry: () => void;
}

export function MentorStaleNotice({ message, onRetry }: MentorStaleNoticeProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 text-sm text-muted">
      <span>{message}</span>
      <Button type="button" variant="secondary" onClick={onRetry}>{t("retry")}</Button>
    </div>
  );
}

interface MentorPaneProps {
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

export function MentorPane({ isLoadingInitial, isFailedInitial, isStaleFailure, isEmpty, errorMessage, staleMessage, emptyContent, skeletonRows, onRetry, children }: MentorPaneProps) {
  if (isLoadingInitial) return <MentorPaneSkeleton rows={skeletonRows} />;
  if (isFailedInitial) return <ErrorState message={errorMessage} onRetry={onRetry} />;
  return (
    <div className="flex flex-col gap-2">
      {isEmpty ? emptyContent : children}
      {isStaleFailure && <MentorStaleNotice message={staleMessage} onRetry={onRetry} />}
    </div>
  );
}
