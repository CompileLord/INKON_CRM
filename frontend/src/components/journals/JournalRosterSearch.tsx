import React from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

interface JournalRosterSearchProps {
  query: string;
  onChange: (query: string) => void;
  matched: number;
  total: number;
  filtering: boolean;
}

export const JournalRosterSearch: React.FC<JournalRosterSearchProps> = ({ query, onChange, matched, total, filtering }) => {
  const { t } = useTranslation("journals");
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 lg:w-auto lg:flex-1 lg:basis-64" data-testid="journal-search-slot">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          aria-label={t("search.label")}
          placeholder={t("search.placeholder")}
          className="h-11 w-full rounded-[10px] border border-control-border bg-card pl-9 pr-12 text-base text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {filtering && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("search.clear")}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {filtering && (
        <p role="status" className="text-sm tabular-nums text-muted">
          {t("search.count", { matched, total })}
        </p>
      )}
    </div>
  );
};
