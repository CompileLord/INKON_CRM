import { BookOpen, Search, Filter, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";

export type EmptyStateType = "catalog" | "status" | "search";

interface EmptyStateProps {
  type?: EmptyStateType;
  isSuperAdmin?: boolean;
  searchQuery?: string;
  page?: number;
  onReset?: () => void;
  onCreateCourse?: () => void;
}

export function EmptyState({
  type = "catalog",
  isSuperAdmin = false,
  searchQuery = "",
  page = 1,
  onReset,
  onCreateCourse,
}: EmptyStateProps) {
  const { t } = useTranslation(["courses", "common"]);

  if (type === "search") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 sm:p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-strip">
          <Search size={24} className="text-muted" />
        </div>
        <p className="text-base font-semibold text-ink">
          {t("noMatchesOnPage", { page })}
        </p>
        <p className="max-w-md text-xs sm:text-sm text-muted">
          {t("noMatchesOnPageHelp", { query: searchQuery, page })}
        </p>
        {onReset ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            className="mt-2 min-h-[44px] min-w-[44px]"
          >
            {t("resetSearch")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (type === "status") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 sm:p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-strip">
          <Filter size={24} className="text-muted" />
        </div>
        <p className="text-base font-semibold text-ink">{t("noStatusMatches")}</p>
        <p className="max-w-md text-xs sm:text-sm text-muted">{t("noStatusMatchesHelp")}</p>
        {onReset ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onReset}
            className="mt-2 min-h-[44px] min-w-[44px]"
          >
            {t("resetFilter")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 sm:p-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-strip">
        <BookOpen size={24} className="text-maroon" />
      </div>
      <p className="text-base font-semibold text-ink">
        {isSuperAdmin ? t("emptyCatalogAdmin") : t("emptyCatalogMentor")}
      </p>
      <p className="max-w-md text-xs sm:text-sm text-muted">
        {isSuperAdmin ? t("emptyCatalogAdminHelp") : t("emptyCatalogMentorHelp")}
      </p>
      {isSuperAdmin && onCreateCourse ? (
        <Button
          type="button"
          variant="primary"
          onClick={onCreateCourse}
          className="mt-2 min-h-[44px] min-w-[44px]"
        >
          <Plus size={16} className="mr-1.5" />
          {t("addCourse")}
        </Button>
      ) : null}
    </div>
  );
}
