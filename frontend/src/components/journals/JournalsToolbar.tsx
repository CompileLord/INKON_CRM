import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/Input";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";

export type JournalStatusFilter = "all" | "active" | "archived";

interface JournalsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: JournalStatusFilter;
  onStatusChange: (value: JournalStatusFilter) => void;
}

const STATUS_VALUES: readonly JournalStatusFilter[] = ["all", "active", "archived"];

export function JournalsToolbar({ search, onSearchChange, status, onStatusChange }: JournalsToolbarProps) {
  const { t } = useTranslation("journals");
  const statusOptions: readonly ListboxOption[] = STATUS_VALUES.map((value) => ({ value, label: t(`filter.${value}`) }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[220px] flex-1 md:max-w-sm">
        <Input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("searchJournalPlaceholder")}
          aria-label={t("hub.searchLabel")}
          leftAddon={<Search size={16} aria-hidden="true" />}
          rightAddon={search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label={t("hub.clearSearch")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : undefined}
        />
      </div>
      <ListboxPicker label={t("hub.statusLabel")} ariaLabel={t("hub.statusFilterLabel")} icon={null} options={statusOptions} value={status} onChange={(value: string) => onStatusChange(value as JournalStatusFilter)} />
    </div>
  );
}
