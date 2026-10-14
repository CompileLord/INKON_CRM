import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

export type JournalStatusFilter = "all" | "active" | "archived";

interface JournalsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: JournalStatusFilter;
  onStatusChange: (value: JournalStatusFilter) => void;
}

const STATUS_VALUES: JournalStatusFilter[] = ["all", "active", "archived"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 dark:focus-visible:ring-accent";

export function JournalsToolbar({ search, onSearchChange, status, onStatusChange }: JournalsToolbarProps) {
  const { t } = useTranslation("journals");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative basis-full lg:min-w-[260px] lg:flex-1 lg:basis-0">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("searchCoursePlaceholder")}
          aria-label={t("hub.searchLabel")}
          className={`h-12 min-h-[48px] w-full rounded-[10px] border border-control-border bg-card py-2.5 pl-9 pr-11 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`}
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={t("hub.clearSearch")}
            className={`absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-[10px] text-muted hover:text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div role="group" aria-label={t("hub.statusFilterLabel")} className="flex flex-wrap items-center gap-2">
        {STATUS_VALUES.map((value) => {
          const isSelected = status === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onStatusChange(value)}
              className={[
                "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]",
                FOCUS_RING,
                isSelected
                  ? "border-maroon bg-maroon font-semibold text-on-primary"
                  : "border-border-warm bg-card text-ink hover:bg-beige",
              ].join(" ")}
            >
              {t(`filter.${value}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
