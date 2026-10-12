import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CoursePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export function CoursePagination({
  page,
  totalPages,
  onPageChange,
}: CoursePaginationProps) {
  const { t } = useTranslation(["courses", "common"]);

  if (totalPages <= 1) return null;

  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("ellipsis");
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages);
    return pages;
  };

  return (
    <nav
      role="navigation"
      aria-label={t("paginationLabel")}
      className="flex items-center justify-center gap-1.5"
    >
      <button
        type="button"
        disabled={!canGoPrevious}
        onClick={() => onPageChange(page - 1)}
        aria-label={t("common:pagination.previous")}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-border-warm bg-card text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-beige disabled:pointer-events-none disabled:opacity-40 motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
      >
        <ChevronLeft size={18} />
      </button>

      <div className="hidden md:flex items-center gap-1.5">
        {getPageNumbers().map((item, idx) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex min-h-[44px] min-w-[32px] items-center justify-center text-xs text-muted"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={[
                "flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-sm font-semibold tabular-nums motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2",
                item === page
                  ? "bg-maroon text-on-primary shadow-xs"
                  : "border border-border-warm bg-card text-ink hover:bg-beige",
              ].join(" ")}
            >
              {item}
            </button>
          ),
        )}
      </div>

      <div className="flex md:hidden items-center px-3">
        <span className="text-sm font-medium tabular-nums text-ink">
          {page} {t("common:of")} {totalPages}
        </span>
      </div>

      <button
        type="button"
        disabled={!canGoNext}
        onClick={() => onPageChange(page + 1)}
        aria-label={t("common:pagination.next")}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border border-border-warm bg-card text-ink motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-beige disabled:pointer-events-none disabled:opacity-40 motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}
