import React from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, Check, Loader2, Pencil } from "lucide-react";
import { Button } from "../ui/Button";
import type { JournalRegistrySnapshot } from "../../lib/journals/JournalQueueRegistry";

interface JournalSaveStatusProps {
  status: JournalRegistrySnapshot;
  onRetry: () => void;
  onReview: () => void;
}

export const JournalSaveStatus: React.FC<JournalSaveStatusProps> = ({ status, onRetry, onReview }) => {
  const { t } = useTranslation("journals");
  const { phase, counts } = status;

  let icon: React.ReactNode = null;
  let message: string = "";
  let tone: string = "text-muted";
  let total: number = 0;

  if (phase === "conflict") {
    icon = <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />;
    message = t("status.conflict");
    tone = "text-destructive";
    total = counts.conflicts;
  } else if (phase === "failed") {
    icon = <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />;
    message = t("status.failed");
    tone = "text-destructive";
    total = counts.failed;
  } else if (phase === "saving") {
    icon = <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />;
    message = t("status.saving");
    tone = "text-amber-600 dark:text-amber-400";
    total = counts.saving;
  } else if (phase === "unsaved") {
    icon = <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />;
    message = t("status.unsaved");
    tone = "text-amber-600 dark:text-amber-400";
    total = counts.unsaved;
  } else if (phase === "saved") {
    icon = <Check className="h-4 w-4 shrink-0" aria-hidden="true" />;
    message = t("status.saved");
    tone = "text-emerald-600 dark:text-emerald-400";
  }

  return (
    <div className="flex min-h-11 items-center gap-2" data-testid="journal-save-status" data-phase={phase}>
      <div role="status" aria-live="polite" aria-atomic="true" className={`flex items-center gap-1.5 text-xs font-medium ${tone}`}>
        {icon}
        {message && <span>{message}</span>}
        {total > 0 && <span className="tabular-nums">({total})</span>}
      </div>
      {phase === "conflict" && (
        <Button type="button" variant="secondary" className="text-xs" onClick={onReview}>
          {t("status.review")}
        </Button>
      )}
      {phase === "failed" && (
        <Button type="button" variant="secondary" className="text-xs" onClick={onRetry}>
          {t("status.retry")}
        </Button>
      )}
    </div>
  );
};
