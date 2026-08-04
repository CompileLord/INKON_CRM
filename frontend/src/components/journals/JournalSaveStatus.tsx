import React from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import type { AggregateSaveStatus } from "../../lib/journals/useJournalAutosave";

interface JournalSaveStatusProps {
  status: AggregateSaveStatus;
  hasPendingEdits: boolean;
  onSaveNow: () => void;
  onRetry: () => void;
  errorCount?: number;
}

export const JournalSaveStatus: React.FC<JournalSaveStatusProps> = ({
  status,
  hasPendingEdits,
  onSaveNow,
  onRetry,
  errorCount = 0,
}) => {
  const { t } = useTranslation("journals");

  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full border border-border bg-card">
        {status === "idle" && (
          <span className="flex items-center gap-1.5 text-muted">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            {t("save.allSaved")}
          </span>
        )}

        {status === "pending" && (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {t("save.pending")}
          </span>
        )}

        {status === "saving" && (
          <span className="flex items-center gap-1.5 text-accent">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t("save.saving")}
          </span>
        )}

        {status === "saved" && (
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <Check className="w-3.5 h-3.5" />
            {t("save.saved")}
          </span>
        )}

        {status === "error" && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>
              {errorCount > 0
                ? t("save.failed", { count: errorCount, defaultValue: t("save.failed_other", { count: errorCount }) })
                : t("save.failed_other", { count: 1 })}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs font-semibold underline hover:no-underline ml-1"
            >
              <RefreshCw className="w-3 h-3" />
              {t("save.retry")}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSaveNow}
        disabled={!hasPendingEdits || status === "saving"}
        className="px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-beige text-ink hover:bg-beige-dark disabled:opacity-50 disabled:pointer-events-none transition-colors"
      >
        {t("save.saveNow")}
      </button>
    </div>
  );
};
