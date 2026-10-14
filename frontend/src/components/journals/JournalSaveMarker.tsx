import React from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, AlertTriangle, Check, Loader2, Pencil, type LucideIcon } from "lucide-react";
import type { CellSaveStatus } from "../../lib/journals/journalQueueTypes";

const MARKER_ICONS: Record<CellSaveStatus, LucideIcon> = {
  dirty: Pencil,
  saving: Loader2,
  saved: Check,
  error: AlertCircle,
  conflict: AlertTriangle,
};

const MARKER_TONES: Record<CellSaveStatus, string> = {
  dirty: "text-amber-500",
  saving: "text-amber-500",
  saved: "text-emerald-500",
  error: "text-destructive",
  conflict: "text-destructive",
};

interface JournalSaveMarkerProps {
  status: CellSaveStatus;
  className?: string;
}

export const JournalSaveMarker: React.FC<JournalSaveMarkerProps> = ({ status, className = "" }) => {
  const { t } = useTranslation("journals");
  const Icon: LucideIcon = MARKER_ICONS[status];
  return (
    <span
      data-testid="save-marker"
      data-status={status}
      className={`pointer-events-none flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card ${MARKER_TONES[status]} ${className}`}
    >
      <Icon className={`h-3 w-3 ${status === "saving" ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
      <span className="sr-only">{t(`cellStatus.${status}`)}</span>
    </span>
  );
};
