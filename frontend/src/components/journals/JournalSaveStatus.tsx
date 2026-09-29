import React from "react";
import { useTranslation } from "react-i18next";
import { Check, AlertCircle, RefreshCw } from "lucide-react";
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
  onRetry,
  errorCount = 0,
}) => {
  const { t } = useTranslation("journals");

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400" role="status">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>
          {errorCount > 0
            ? t("save.failed", { count: errorCount, defaultValue: t("save.failed_other", { count: errorCount }) })
            : t("save.failed_other", { count: 1 })}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 text-xs font-semibold underline hover:no-underline"
        >
          <RefreshCw className="w-3 h-3" />
          {t("save.retry")}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 motion-safe:transition-opacity duration-200 ${
        status === "saved" ? "opacity-100" : "opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <Check className="w-3.5 h-3.5 text-emerald-500" />
    </div>
  );
};
