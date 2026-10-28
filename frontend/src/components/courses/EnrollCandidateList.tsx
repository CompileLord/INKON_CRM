import { AlertCircle, RotateCcw, Search, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { EnrollCandidateRow } from "./EnrollCandidateRow";
import type { EligibleCandidateResponse } from "../../lib/enrollments/types";
import type { EnrollFailureKey } from "./enrollFailureKey";

interface EnrollCandidateListProps {
  search: string;
  debouncedSearch: string;
  onSearchChange: (value: string) => void;
  rows: EligibleCandidateResponse[];
  selectedIds: ReadonlySet<number>;
  enrolledIds: ReadonlySet<number>;
  failures: Readonly<Record<number, EnrollFailureKey>>;
  disabled: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onRetry: () => void;
  totalCandidates: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onToggle: (candidate: EligibleCandidateResponse) => void;
}

export function EnrollCandidateList(props: EnrollCandidateListProps) {
  const { t } = useTranslation(["courses", "common"]);
  const { search, debouncedSearch, rows, disabled, isLoading, isFetching, isError, totalCandidates, page, totalPages } = props;
  const hasNoCandidates: boolean = totalCandidates === 0 && !debouncedSearch;

  return (
    <>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          disabled={disabled}
          placeholder={t("enrollment.searchPlaceholder")}
          aria-label={t("enrollment.searchPlaceholder")}
          className="min-h-[48px] w-full rounded-xl border border-control-border bg-card py-2.5 pl-10 pr-12 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon sm:text-sm dark:focus-visible:ring-accent"
        />
        {search ? (
          <button
            type="button"
            onClick={() => props.onSearchChange("")}
            disabled={disabled}
            aria-label={t("students.resetSearch")}
            className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-[220px] flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">{t("enrollment.candidatesTitle")}</span>
          {isFetching && !isLoading ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <BrandActivityIndicator size={12} />
              <span>{t("updating")}</span>
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 4 }, (_unused, index: number) => (
              <div key={index} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-strip p-3 motion-safe:animate-pulse">
                <div className="h-4 w-4 shrink-0 rounded bg-border" />
                <div className="h-9 w-9 shrink-0 rounded-full bg-border" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="h-4 w-32 rounded bg-border" />
                  <div className="h-3 w-48 rounded bg-border" />
                </div>
              </div>
            ))}
          </div>
        ) : isError && rows.length === 0 ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
            <AlertCircle size={22} className="text-destructive" />
            <p className="text-sm font-medium text-destructive">{t("enrollment.candidatesLoadError")}</p>
            <Button type="button" variant="secondary" onClick={props.onRetry} className="min-h-[44px] gap-1.5">
              <RotateCcw size={14} />
              <span>{t("common:retry")}</span>
            </Button>
          </div>
        ) : hasNoCandidates && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-strip p-8 text-center">
            <UserRound size={28} className="text-muted" />
            <p className="text-sm font-medium text-ink">{t("enrollment.emptyCandidates")}</p>
            <p className="max-w-sm text-xs text-muted">{t("enrollment.emptyCandidatesHelp")}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-strip p-8 text-center">
            <p className="text-sm font-medium text-ink">{t("enrollment.noMatches", { query: debouncedSearch })}</p>
            <Button type="button" variant="secondary" onClick={() => props.onSearchChange("")} className="mt-2 min-h-[44px]">
              {t("students.resetSearch")}
            </Button>
          </div>
        ) : (
          <div role="group" aria-label={t("enrollment.candidatesTitle")} className="flex flex-col gap-1.5">
            {rows.map((candidate: EligibleCandidateResponse) => (
              <EnrollCandidateRow
                key={candidate.id}
                candidate={candidate}
                isSelected={props.selectedIds.has(candidate.id)}
                isEnrolled={props.enrolledIds.has(candidate.id)}
                failure={props.failures[candidate.id]}
                disabled={disabled}
                onToggle={props.onToggle}
              />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
            <Button type="button" variant="secondary" disabled={page <= 1 || isFetching || isLoading || disabled} onClick={() => props.onPageChange(Math.max(1, page - 1))} className="min-h-[44px] text-xs">
              {t("paginationPrev")}
            </Button>
            <span className="text-xs tabular-nums text-muted">{t("paginationPage", { page, total: totalPages })}</span>
            <Button type="button" variant="secondary" disabled={page >= totalPages || isFetching || isLoading || disabled} onClick={() => props.onPageChange(Math.min(totalPages, page + 1))} className="min-h-[44px] text-xs">
              {t("paginationNext")}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
