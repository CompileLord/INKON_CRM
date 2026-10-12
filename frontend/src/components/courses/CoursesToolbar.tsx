import { useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PhoneFiltersDialog } from "./PhoneFiltersDialog";
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
  isTabletOrDesktop: boolean;
  searchInputRef?: React.Ref<HTMLInputElement>;
}

const STATUS_FILTER_VALUES: StatusFilter[] = ["all", "active", "archived"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2";

const CHIP_BASE = `min-h-[44px] rounded-full border px-4 py-2 text-xs md:text-sm font-medium motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] ${FOCUS_RING}`;

export function CoursesToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  isTabletOrDesktop,
  searchInputRef,
}: CoursesToolbarProps) {
  const { t } = useTranslation("courses");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [prevIsTabletOrDesktop, setPrevIsTabletOrDesktop] = useState(isTabletOrDesktop);
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);

  if (isTabletOrDesktop !== prevIsTabletOrDesktop) {
    setPrevIsTabletOrDesktop(isTabletOrDesktop);
    if (isTabletOrDesktop) {
      setFiltersOpen(false);
    }
  }

  useEffect(() => {
    if (isTabletOrDesktop && filtersOpen) {
      setFiltersOpen(false);
    }
  }, [isTabletOrDesktop, filtersOpen]);

  if (isTabletOrDesktop) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className={`min-h-[48px] h-12 w-full rounded-[10px] border border-control-border bg-card py-2.5 pl-9 pr-11 text-sm text-ink placeholder:text-muted ${FOCUS_RING}`}
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label={t("resetSearch")}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
            >
              <X size={16} />
            </button>
          ) : null}
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
                    ? "border-maroon bg-maroon text-on-primary font-semibold shadow-xs"
                    : "border-border-warm bg-card text-ink hover:bg-beige",
                ].join(" ")}
              >
                {t(`filter.${val}`)}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortOption)}
              aria-label={t("sortBy")}
              className={`min-h-[44px] appearance-none rounded-[10px] border border-control-border bg-card py-2 pl-3.5 pr-8 text-sm font-medium text-ink cursor-pointer hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out ${FOCUS_RING}`}
            >
              <option value="newest">{t("sort.newest")}</option>
              <option value="price">{t("sort.price")}</option>
            </select>
            <SlidersHorizontal
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
          </div>

          <div
            role="group"
            className="flex items-center rounded-[10px] border border-border-warm bg-strip p-1"
          >
            <button
              type="button"
              aria-label={t("view.grid")}
              aria-pressed={view === "grid"}
              onClick={() => onViewChange("grid")}
              className={[
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
                FOCUS_RING,
                view === "grid"
                  ? "bg-card text-maroon font-semibold shadow-xs"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              aria-label={t("view.list")}
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
              className={[
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
                FOCUS_RING,
                view === "list"
                  ? "bg-card text-maroon font-semibold shadow-xs"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative w-full">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`h-12 w-full rounded-[10px] border border-control-border bg-card py-3 pl-10 pr-10 text-base text-ink placeholder:text-muted ${FOCUS_RING}`}
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={t("resetSearch")}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTER_VALUES.map((val) => {
            const isActive = status === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onStatusChange(val)}
                className={[
                  "min-h-[44px] rounded-full border px-3.5 py-2 text-xs font-medium motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96]",
                  FOCUS_RING,
                  isActive
                    ? "border-maroon bg-maroon text-on-primary font-semibold shadow-xs"
                    : "border-border-warm bg-card text-ink hover:bg-beige",
                ].join(" ")}
              >
                {t(`filter.${val}`)}
              </button>
            );
          })}
        </div>

        <button
          ref={filtersTriggerRef}
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label={t("filters")}
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          className={`flex min-h-[44px] items-center gap-1.5 rounded-full border border-border-warm bg-card px-3.5 py-2 text-xs font-medium text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-beige motion-safe:active:scale-[0.96] ${FOCUS_RING}`}
        >
          <SlidersHorizontal size={14} />
          <span>{t("filters")}</span>
          {sort !== "newest" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          ) : null}
        </button>
      </div>

      <PhoneFiltersDialog
        open={filtersOpen}
        sort={sort}
        onSortChange={onSortChange}
        onClose={() => setFiltersOpen(false)}
        triggerRef={filtersTriggerRef}
      />
    </div>
  );
}
