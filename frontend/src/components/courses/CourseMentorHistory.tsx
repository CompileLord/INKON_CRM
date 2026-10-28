import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCourseMentorHistory } from "../../lib/courses/hooks";
import { formatDate } from "../../i18n/formatters";
import { ChevronDown } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { PersonAvatar } from "../ui/PersonAvatar";
import type { CourseMentorHistoryResponse } from "../../lib/courses/types";

export function CourseMentorHistory({ courseId }: { courseId: number }) {
  const { t } = useTranslation("courseDetail");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { data: history, isLoading, isError, refetch } = useCourseMentorHistory(courseId, isOpen);

  const rangeLabel = (entry: CourseMentorHistoryResponse): string =>
    entry.assigned_to
      ? `${formatDate(entry.assigned_from)} – ${formatDate(entry.assigned_to)}`
      : t("history.since", { start: formatDate(entry.assigned_from) });

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="mentor-history-list"
        aria-label={t("history.toggleLabel")}
        onClick={() => setIsOpen((previous: boolean) => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] px-1 text-sm font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
      >
        <span>{t("history.title")}</span>
        <ChevronDown aria-hidden="true" className={`size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && isLoading && !history ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1].map((row: number) => <div key={row} className="h-12 rounded-[10px] bg-strip motion-safe:animate-pulse" />)}
        </div>
      ) : null}
      {isOpen && isError && !history ? <ErrorState message={t("history.loadError")} onRetry={() => refetch()} /> : null}
      {isOpen && history && history.length === 0 ? <EmptyState title={t("history.empty")} /> : null}
      {isOpen && history && history.length > 0 ? (
        <ul id="mentor-history-list" className="flex flex-col divide-y divide-border">
          {history.map((entry: CourseMentorHistoryResponse) => (
            <li key={entry.id} className="flex items-center gap-3 py-2">
              <PersonAvatar firstName={entry.mentor.first_name} lastName={entry.mentor.last_name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-ink">{entry.mentor.first_name} {entry.mentor.last_name}</p>
                <p className="text-xs tabular-nums text-muted">{rangeLabel(entry)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
