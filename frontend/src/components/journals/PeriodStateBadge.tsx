import React from "react";
import { useTranslation } from "react-i18next";

export type PeriodState = "upcoming" | "empty" | "partial" | "complete";

interface PeriodStateBadgeProps {
  state: PeriodState;
  className?: string;
}

export const PeriodStateBadge: React.FC<PeriodStateBadgeProps> = ({ state, className = "" }) => {
  const { t } = useTranslation("journals");

  const stateConfig: Record<PeriodState, { style: string; key: string }> = {
    upcoming: {
      style: "bg-strip text-muted border-border",
      key: "period.stateUpcoming",
    },
    empty: {
      style: "bg-strip text-muted border-border",
      key: "period.stateEmpty",
    },
    partial: {
      style: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      key: "period.statePartial",
    },
    complete: {
      style: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      key: "period.stateComplete",
    },
  };

  const config = stateConfig[state] ?? stateConfig.empty;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border transition-colors ${config.style} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          state === "complete"
            ? "bg-emerald-500"
            : state === "partial"
            ? "bg-amber-500"
            : "bg-muted"
        }`}
      />
      {t(config.key, config.key.split(".").pop())}
    </span>
  );
};
