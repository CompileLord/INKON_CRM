import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../i18n/formatters";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis");
    result.push(p);
    prev = p;
  }
  return result;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const { t, i18n } = useTranslation("common");
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={t("pagination.previous")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-strip disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>

      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-muted tabular-nums">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-medium tabular-nums motion-safe:transition-[background-color,color,transform,box-shadow] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              p === page
                ? "bg-maroon text-on-primary font-bold shadow-xs"
                : "text-ink hover:bg-strip",
            ].join(" ")}
          >
            {formatNumber(p, i18n.language)}
          </button>
        ),
      )}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label={t("pagination.next")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-ink motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-strip disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
