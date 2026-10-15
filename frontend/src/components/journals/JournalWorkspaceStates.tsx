import React from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Info } from "lucide-react";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";

interface JournalPanelMessageProps {
  tone: "empty" | "error";
  title: string;
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export const JournalPanelMessage: React.FC<JournalPanelMessageProps> = ({ tone, title, body, retryLabel, onRetry }) => {
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center"
    >
      <Icon className={`h-6 w-6 ${tone === "error" ? "text-destructive" : "text-muted"}`} aria-hidden="true" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {body && <p className="max-w-prose text-sm text-muted">{body}</p>}
      {onRetry && retryLabel && (
        <Button type="button" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
};

interface JournalSkeletonBarProps {
  className: string;
}

const JournalSkeletonBar: React.FC<JournalSkeletonBarProps> = ({ className }) => (
  <div className={`rounded-md bg-beige-dark motion-safe:animate-pulse ${className}`} />
);

export const JournalContextSkeleton: React.FC = () => {
  const { t } = useTranslation("journals");
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="journal-context-skeleton"
      className="flex flex-col gap-4"
    >
      <span className="sr-only">{t("loading")}</span>
      <JournalSkeletonBar className="h-4 w-24" />
      <JournalSkeletonBar className="h-9 w-2/3 max-w-md" />
      <JournalSkeletonBar className="h-4 w-1/2 max-w-xs" />
      <JournalSkeletonBar className="h-14 w-full lg:w-[420px]" />
      <JournalSkeletonBar className="h-11 w-64" />
    </div>
  );
};

const SKELETON_ROW_COUNT = 6;
const SKELETON_LESSON_COLUMN_COUNT = 3;

export const JournalGridSkeleton: React.FC = () => {
  const { t } = useTranslation("journals");
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="journal-grid-skeleton"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-3 border-b border-border bg-beige px-4 py-3 text-sm text-muted">
        <BrandActivityIndicator size={18} aria-hidden="true" />
        <span>{t("loading")}</span>
      </div>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <div key={rowIndex} className="flex border-b border-border last:border-b-0">
          <div className="flex min-h-[64px] w-[200px] shrink-0 items-center border-r border-border px-4">
            <JournalSkeletonBar className="h-4 w-32" />
          </div>
          {Array.from({ length: SKELETON_LESSON_COLUMN_COUNT }, (_, columnIndex) => (
            <div key={columnIndex} className="flex min-h-[64px] w-[160px] shrink-0 items-center justify-center gap-1 px-1">
              <JournalSkeletonBar className="h-11 w-11" />
              <JournalSkeletonBar className="h-11 w-11" />
              <JournalSkeletonBar className="h-11 w-11" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

interface JournalNoticeProps {
  tone: "info" | "warning";
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  testId?: string;
}

export const JournalNotice: React.FC<JournalNoticeProps> = ({ tone, children, action, testId }) => (
  <div
    role="status"
    data-testid={testId}
    className={`flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-2 text-sm ${
      tone === "warning"
        ? "border-warning/40 bg-warning-surface text-warning"
        : "border-info/30 bg-info-surface text-info"
    }`}
  >
    <span className="min-w-0 break-words">{children}</span>
    {action && (
      <button
        type="button"
        onClick={action.onClick}
        className="min-h-11 rounded-[10px] px-3 text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {action.label}
      </button>
    )}
  </div>
);

export const JournalPeriodBarSkeleton: React.FC = () => {
  const { t } = useTranslation("journals");
  return (
    <div role="status" aria-busy="true" data-testid="journal-period-skeleton" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <BrandActivityIndicator size={18} aria-hidden="true" />
        <span>{t("loading")}</span>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <JournalSkeletonBar className="h-14 w-full lg:w-[420px]" />
        <JournalSkeletonBar className="h-11 w-40" />
      </div>
    </div>
  );
};

export const JournalLessonSkeleton: React.FC = () => {
  const { t } = useTranslation("journals");
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="journal-lesson-skeleton"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-3 border-b border-border bg-beige px-4 py-3 text-sm text-muted">
        <BrandActivityIndicator size={18} aria-hidden="true" />
        <span>{t("loading")}</span>
      </div>
      {Array.from({ length: 4 }, (_, rowIndex) => (
        <div key={rowIndex} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
          <JournalSkeletonBar className="h-6 w-2/3" />
          <div className="flex flex-wrap gap-2">
            <JournalSkeletonBar className="h-11 w-28" />
            <JournalSkeletonBar className="h-11 w-24" />
            <JournalSkeletonBar className="h-11 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
};
