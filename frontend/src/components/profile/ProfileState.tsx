import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { PageContainer } from "../ui/PageContainer";

interface ProfileStateProps {
  backLink: ReactNode;
  title: string;
  message: string;
  onRetry?: () => void;
  stateName: string;
}

export function ProfileState({ backLink, title, message, onRetry, stateName }: ProfileStateProps) {
  const { t } = useTranslation("ui");
  return (
    <PageContainer>
      {backLink}
      <div
        role={onRetry ? "alert" : "status"}
        data-profile-state={stateName}
        className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-4 py-10 text-center"
      >
        <h1 className="text-base font-medium text-ink [overflow-wrap:anywhere]">{title}</h1>
        <p className="max-w-md text-sm text-muted [overflow-wrap:anywhere]">{message}</p>
        {onRetry !== undefined && (
          <Button type="button" variant="secondary" className="mt-2" onClick={onRetry}>{t("retry")}</Button>
        )}
      </div>
    </PageContainer>
  );
}

interface ProfileSkeletonProps {
  backLink: ReactNode;
  hasStats: boolean;
}

export function ProfileSkeleton({ backLink, hasStats }: ProfileSkeletonProps) {
  return (
    <PageContainer>
      {backLink}
      <div role="status" aria-busy="true" className="flex flex-col gap-6 motion-safe:animate-pulse">
        <div data-loading-header className="flex items-center gap-4">
          <div data-loading-avatar className="size-14 shrink-0 rounded-[12px] bg-strip" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-7 w-full max-w-72 rounded bg-strip" />
            <div className="h-4 w-full max-w-96 rounded bg-strip" />
          </div>
        </div>
        {hasStats && (
          <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card lg:flex lg:divide-y-0 [&>*]:min-w-0 lg:[&>*]:flex-1">
            {[0, 1, 2].map((tile: number) => (
              <div key={tile} className="flex flex-col gap-2 px-4 py-3">
                <div className="h-4 w-20 rounded bg-strip" />
                <div className="h-7 w-16 rounded bg-strip" />
              </div>
            ))}
          </div>
        )}
        <div data-loading-tabs className="flex gap-3 border-b border-border pb-3">
          {[0, 1, 2].map((tab: number) => <div key={tab} className="h-5 w-24 rounded bg-strip" />)}
        </div>
        <div className="h-48 rounded-2xl border border-border bg-card" />
      </div>
    </PageContainer>
  );
}
