import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FillBar } from "../courses/FillBar";
import { PeriodStateBadge } from "../journals/PeriodStateBadge";

export interface GradingQueueItem {
  journal_id: number;
  course_id: number;
  course_title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  state: "upcoming" | "empty" | "partial" | "complete";
  cells_filled: number;
  cells_expected: number;
  is_current: boolean;
}

interface GradingQueueRowProps {
  item: GradingQueueItem;
}

export const GradingQueueRow: React.FC<GradingQueueRowProps> = ({ item }) => {
  const { t } = useTranslation("journals");
  const fillRate = item.cells_expected > 0 ? (item.cells_filled / item.cells_expected) * 100 : 0;

  return (
    <Link
      to={`/journals/${item.course_id}?period=${item.journal_id}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border-warm bg-card hover:bg-row-hover transition-colors shadow-sm"
    >
      <div className="flex flex-col min-w-0 sm:w-1/3">
        <span className="text-sm font-semibold text-ink truncate">{item.course_title}</span>
        <span className="text-xs text-muted mt-0.5">{item.period_label}</span>
      </div>

      <div className="flex flex-col sm:w-1/3 gap-1">
        <FillBar rate={fillRate} heightClass="h-2" />
        <span className="text-[11px] text-muted tabular-nums">
          {t("period.completion", { marked: item.cells_filled, total: item.cells_expected })}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:justify-end shrink-0">
        {item.is_current && (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-maroon/10 text-maroon dark:bg-accent/10 dark:text-accent border border-maroon/20">
            {t("period.current")}
          </span>
        )}
        <PeriodStateBadge state={item.state} />
      </div>
    </Link>
  );
};
