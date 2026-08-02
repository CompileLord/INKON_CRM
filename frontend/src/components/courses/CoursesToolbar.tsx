import { LayoutGrid, List, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CourseStatus } from "../../lib/courses/types";

export type SortOption = "newest" | "price";
export type ViewMode = "grid" | "list";
export type StatusFilter = CourseStatus | "all";

interface CoursesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
}

const STATUS_FILTER_VALUES: StatusFilter[] = ["all", "active", "archived"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

const CHIP_BASE = `rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150 ${FOCUS_RING}`;

export function CoursesToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: CoursesToolbarProps) {
  const { t } = useTranslation("courses");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("searchPlaceholder", "Поиск по названию…")}
          className={`w-56 rounded-full border border-border-warm bg-card py-2 pl-9 pr-4 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTER_VALUES.map((val) => {
          const isActive = status === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onStatusChange(val)}
              className={[
                CHIP_BASE,
                isActive
                  ? "border-maroon bg-maroon text-white dark:border-accent dark:bg-accent dark:text-white shadow-xs font-semibold"
                  : "border-border-warm bg-card text-ink hover:bg-beige",
              ].join(" ")}
            >
              {t(`filter.${val}`, val === "all" ? "Все" : val === "active" ? "Активные" : "Архив")}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className={`rounded-lg border border-border-warm bg-card px-3 py-2 text-sm text-ink ${FOCUS_RING}`}
        >
          <option value="newest">{t("sort.newest", "Сначала новые")}</option>
          <option value="price">{t("sort.price", "По цене")}</option>
        </select>

        <div className="flex items-center rounded-lg border border-border-warm bg-card p-0.5">
          <button
            type="button"
            aria-label={t("view.grid", "Плитка")}
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150",
              FOCUS_RING,
              view === "grid" ? "bg-beige text-ink font-semibold" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            aria-label={t("view.list", "Список")}
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150",
              FOCUS_RING,
              view === "list" ? "bg-beige text-ink font-semibold" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <List size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
