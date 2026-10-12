import React from "react";
import { useTranslation } from "react-i18next";

export type PeriodState = "upcoming" | "empty" | "partial" | "complete";

interface PeriodStateBadgeProps {
  state: string;
  className?: string;
}

export const PeriodStateBadge: React.FC<PeriodStateBadgeProps> = ({ state, className = "" }) => {
  const { t } = useTranslation("journals");

  const stateConfig: Record<PeriodState, { style: string; dotStyle: string; key: string }> = {
    upcoming: {
      style: "bg-strip text-muted border-border",
      dotStyle: "bg-muted",
      key: "period.stateUpcoming",
    },
    empty: {
      style: "bg-strip text-muted border-border",
      dotStyle: "bg-muted",
      key: "period.stateEmpty",
    },
    partial: {
      style: "bg-warning-surface text-warning border-warning/30",
      dotStyle: "bg-warning",
      key: "period.statePartial",
    },
    complete: {
      style: "bg-success-surface text-success border-success/30",
      dotStyle: "bg-success",
      key: "period.stateComplete",
    },
  };

  const isKnownState = (val: string): val is PeriodState => Object.hasOwn(stateConfig, val);
  const config = isKnownState(state)
    ? stateConfig[state]
    : {
        style: "bg-strip text-muted border-border",
        dotStyle: "bg-muted",
        key: "period.stateUnavailable",
      };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${config.style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotStyle}`} />
      {t(config.key)}
    </span>
  );
};
