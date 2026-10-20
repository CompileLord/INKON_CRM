import type { Ref } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/Input";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import { SegmentedControl, type SegmentedOption } from "../ui/SegmentedControl";
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
  showViewSwitch: boolean;
  searchInputRef?: Ref<HTMLInputElement>;
}

const STATUS_FILTER_VALUES: readonly StatusFilter[] = ["all", "active", "archived"];
const SORT_VALUES: readonly SortOption[] = ["newest", "price"];

export function CoursesToolbar({ search, onSearchChange, status, onStatusChange, sort, onSortChange, view, onViewChange, showViewSwitch, searchInputRef }: CoursesToolbarProps) {
  const { t } = useTranslation("courses");
  const statusOptions: readonly ListboxOption[] = STATUS_FILTER_VALUES.map((value) => ({ value, label: t(`filter.${value}`) }));
  const sortOptions: readonly ListboxOption[] = SORT_VALUES.map((value) => ({ value, label: t(`sort.${value}`) }));
  const viewOptions: readonly SegmentedOption[] = [
    { value: "grid", label: t("view.grid"), icon: <LayoutGrid size={16} aria-hidden="true" /> },
    { value: "list", label: t("view.list"), icon: <List size={16} aria-hidden="true" /> },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[220px] flex-1 md:max-w-sm">
        <Input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          leftAddon={<Search size={16} aria-hidden="true" />}
          rightAddon={search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label={t("resetSearch")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : undefined}
        />
      </div>
      <ListboxPicker label={t("statusLabel")} icon={null} options={statusOptions} value={status} onChange={(value: string) => onStatusChange(value as StatusFilter)} />
      <ListboxPicker label={t("sortLabel")} icon={null} options={sortOptions} value={sort} onChange={(value: string) => onSortChange(value as SortOption)} />
      {showViewSwitch && (
        <div className="ml-auto">
          <SegmentedControl ariaLabel={t("view.label")} options={viewOptions} value={view} onChange={(value: string) => onViewChange(value as ViewMode)} />
        </div>
      )}
    </div>
  );
}
