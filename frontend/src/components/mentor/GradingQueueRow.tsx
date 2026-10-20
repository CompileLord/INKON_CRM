import { useTranslation } from "react-i18next";
import { PeriodStateBadge } from "../journals/PeriodStateBadge";
import { ListRow } from "../ui/ListRow";
import { usePeriodName } from "../ui/periodName";
import type { GradingQueueItemResponse } from "../../lib/journals/types";

export type GradingQueueItem = GradingQueueItemResponse;

interface GradingQueueRowProps {
  item: GradingQueueItem;
}

export function GradingQueueRow({ item }: GradingQueueRowProps) {
  const { t } = useTranslation("journals");
  const periodName: (label: string) => string = usePeriodName();
  return (
    <ListRow to={`/journals/${item.course_id}?period=${item.journal_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <span className="break-words text-sm font-medium text-ink">{item.course_title}</span>
          <span className="break-words text-sm text-muted">{periodName(item.period_label)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted">
            {t("period.completion", { marked: item.cells_filled, total: item.cells_expected })}
          </span>
          <PeriodStateBadge state={item.state} />
        </div>
      </div>
    </ListRow>
  );
}
