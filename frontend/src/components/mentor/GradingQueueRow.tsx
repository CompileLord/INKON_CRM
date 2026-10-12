import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PeriodStateBadge } from "../journals/PeriodStateBadge";
import type { GradingQueueItemResponse } from "../../lib/journals/types";

export type GradingQueueItem = GradingQueueItemResponse;

interface GradingQueueRowProps {
  item: GradingQueueItem;
}

export const GradingQueueRow: React.FC<GradingQueueRowProps> = ({ item }) => {
  const { t } = useTranslation(["journals", "dashboard", "common"]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border-warm bg-card shadow-sm">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-semibold text-ink break-words">{item.course_title}</span>
        <span className="text-xs text-muted break-words mt-0.5">{item.period_label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
        <span className="text-xs text-muted tabular-nums break-words">
          {t("journals:period.completion", { marked: item.cells_filled, total: item.cells_expected })}
        </span>
        {item.is_current && (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-strip text-maroon border border-border-warm">
            {t("journals:period.current")}
          </span>
        )}
        <PeriodStateBadge state={item.state} />
        <Link
          to={`/journals/${item.course_id}?period=${item.journal_id}`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-card border border-control-border text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-strip motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 self-start sm:self-auto"
          aria-label={`${t("dashboard:openJournal")}: ${item.course_title} - ${item.period_label}`}
        >
          <span>{t("dashboard:openJournal")}</span>
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
};
