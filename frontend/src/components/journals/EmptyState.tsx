import { ClipboardList } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  onReset: () => void;
}

export function EmptyState({ onReset }: EmptyStateProps) {
  const { t } = useTranslation(["journals", "common"]);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card py-16 text-center">
      <div className="flex h-18 w-18 items-center justify-center rounded-full bg-strip">
        <ClipboardList size={28} className="text-maroon" />
      </div>
      <p className="text-base font-semibold text-ink">{t("noJournals")}</p>
      <p className="text-[13px] text-muted">{t("tryFilterChange")}</p>
      <button
        type="button"
        onClick={onReset}
        className="mt-1 rounded-lg border border-border-warm bg-card px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-strip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        {t("common:clearFilter")}
      </button>
    </div>
  );
}
