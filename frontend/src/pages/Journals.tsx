import { useEffect, useMemo, useRef } from "react";
import { PageHeader } from "../components/PageHeader";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, ClipboardList, SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourses } from "../lib/courses/hooks";
import { useMentors } from "../lib/users/hooks";
import { parseSafePageParam } from "../lib/courses/returnContext";
import { useAuthStore } from "../store/authStore";
import { Button } from "../components/ui/Button";
import { Pagination as CoursePagination } from "../components/ui/Pagination";
import { JournalListRow, JournalListRowSkeleton } from "../components/journals/JournalListRow";
import type { JournalRowMentorState } from "../components/journals/JournalListRow";
import { JournalsToolbar } from "../components/journals/JournalsToolbar";
import type { JournalStatusFilter } from "../components/journals/JournalsToolbar";
import { journalsHubReturnStore, JournalsHubReturnStore } from "../components/journals/JournalsHubReturnStore";
import type { User } from "../lib/users/types";

const PAGE_SIZE = 20;
const SKELETON_ROW_COUNT = 6;

export function Journals() {
  const location = useLocation();
  const pendingReturn = location.search === "" ? journalsHubReturnStore.peekPending() : null;
  if (pendingReturn && pendingReturn.search !== "") {
    return <Navigate to={`/journals${pendingReturn.search}`} replace />;
  }
  return <JournalsHub />;
}

function JournalsHub() {
  const { t } = useTranslation(["journals", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const isSuperAdmin = role === "superadmin";

  const rawStatus = searchParams.get("status");
  const status: JournalStatusFilter = rawStatus === "active" || rawStatus === "archived" ? rawStatus : "all";
  const page = parseSafePageParam(searchParams.get("page"));
  const search = searchParams.get("q") ?? "";
  const normalizedQuery = search.trim().toLowerCase();

  const {
    data: coursesPage,
    isLoading,
    isPlaceholderData,
    isError,
    isFetching,
    refetch,
  } = useCourses({ status: status === "all" ? undefined : status, page, page_size: PAGE_SIZE });

  const mentorsQuery = useMentors({ page_size: 100 }, isSuperAdmin);

  const isSettled = !isLoading && !isPlaceholderData && Boolean(coursesPage);
  const showSkeleton = isLoading || isPlaceholderData;
  const isHardError = isError && !coursesPage;
  const isRefreshFailed = isError && Boolean(coursesPage) && !isPlaceholderData;
  const isRefreshing = isFetching && isSettled && !isError;

  const currentSearchKey = useMemo(
    () => JournalsHubReturnStore.sanitizeSearch(searchParams.toString()),
    [searchParams],
  );

  const hasConsumedReturnRef = useRef(false);
  useEffect(() => {
    if (!isSettled || hasConsumedReturnRef.current) return;
    hasConsumedReturnRef.current = true;
    const pending = journalsHubReturnStore.peekPending();
    journalsHubReturnStore.clear();
    if (!pending || pending.search !== currentSearchKey || pending.scrollY <= 0) return;
    const frameId = requestAnimationFrame(() => window.scrollTo({ top: pending.scrollY, behavior: "auto" }));
    return () => cancelAnimationFrame(frameId);
  }, [isSettled, currentSearchKey]);

  useEffect(() => {
    if (!isSettled || !coursesPage) return;
    const lastValidPage = Math.max(1, coursesPage.total_pages);
    if (page > lastValidPage) {
      updateParams((next) => {
        if (lastValidPage <= 1) next.delete("page");
        else next.set("page", String(lastValidPage));
      }, true);
    }
  }, [isSettled, coursesPage, page]);

  function updateParams(mutate: (next: URLSearchParams) => void, replace: boolean): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        mutate(next);
        return next;
      },
      { replace },
    );
  }

  const handleSearchChange = (value: string) => {
    updateParams((next) => {
      if (value.trim()) next.set("q", value);
      else next.delete("q");
    }, true);
  };

  const handleStatusChange = (value: JournalStatusFilter) => {
    updateParams((next) => {
      if (value === "all") next.delete("status");
      else next.set("status", value);
      next.delete("page");
    }, false);
  };

  const handlePageChange = (value: number) => {
    updateParams((next) => {
      if (value <= 1) next.delete("page");
      else next.set("page", String(value));
    }, false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const clearSearchAndFilters = () => {
    updateParams((next) => {
      next.delete("q");
      next.delete("status");
      next.delete("page");
    }, false);
  };

  const recordNavigationOut = () => {
    journalsHubReturnStore.recordNavigationOut(searchParams.toString(), window.scrollY);
  };

  const visibleCourses = useMemo(() => {
    if (!isSettled || !coursesPage) return [];
    return normalizedQuery
      ? coursesPage.items.filter((course) => course.title.toLowerCase().includes(normalizedQuery))
      : coursesPage.items;
  }, [isSettled, coursesPage, normalizedQuery]);

  const mentorsById = useMemo(() => {
    const index = new Map<number, User>();
    for (const mentor of mentorsQuery.data?.items ?? []) index.set(mentor.id, mentor);
    return index;
  }, [mentorsQuery.data]);

  const resolveMentorState = (mentorId: number): JournalRowMentorState => {
    if (!isSuperAdmin) return { kind: "hidden" };
    const mentor = mentorsById.get(mentorId);
    if (mentor) return { kind: "ready", mentor };
    if (mentorsQuery.isLoading) return { kind: "loading" };
    return { kind: "unavailable" };
  };

  const isEmptyCatalog = isSettled && coursesPage !== undefined && coursesPage.total === 0 && status === "all";
  const isNoMatch = isSettled && !isEmptyCatalog && visibleCourses.length === 0;
  const isTrulyEmptyCatalog = isEmptyCatalog && normalizedQuery === "";
  const hasRows = isSettled && visibleCourses.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("hubTitle")} />

      {isTrulyEmptyCatalog ? null : (
        <JournalsToolbar
          search={search}
          onSearchChange={handleSearchChange}
          status={status}
          onStatusChange={handleStatusChange}
        />
      )}

      {isSettled && coursesPage && !isTrulyEmptyCatalog ? (
        <div role="status" className="flex flex-col gap-0.5 text-xs text-muted">
          <span className="tabular-nums">
            {normalizedQuery
              ? t("hub.searchPageScope", { count: visibleCourses.length, total: coursesPage.items.length })
              : t("hub.resultsTotal", { count: coursesPage.total })}
            {isRefreshing ? <span> · {t("hub.refreshing")}</span> : null}
          </span>
          {normalizedQuery ? <span>{t("hub.searchScopeNotice")}</span> : null}
        </div>
      ) : null}

      {showSkeleton ? <div aria-hidden="true" className="h-4 w-24 rounded-[10px] bg-strip motion-safe:animate-pulse" /> : null}

      {isRefreshFailed ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-surface bg-warning-surface/40 px-4 py-3 text-sm text-ink"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0 text-warning" aria-hidden="true" />
            <span>{t("hub.refreshFailed")}</span>
          </div>
          <Button type="button" variant="secondary" onClick={() => refetch()} className="min-h-[44px] min-w-[44px]">
            {t("common:retry")}
          </Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <ul
          aria-busy="true"
          aria-label={t("hub.listLabel")}
          className="divide-y divide-border overflow-hidden rounded-2xl border border-border-warm bg-card"
        >
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <JournalListRowSkeleton key={index} showMentor={isSuperAdmin} />
          ))}
        </ul>
      ) : isHardError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-10 text-center">
          <AlertCircle size={28} className="text-destructive" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">{t("loadFailedHub")}</p>
          <Button type="button" variant="secondary" onClick={() => refetch()} className="mt-2 min-h-[44px] min-w-[44px]">
            {t("common:retry")}
          </Button>
        </div>
      ) : isEmptyCatalog ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card px-6 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-strip">
            <ClipboardList size={26} className="text-maroon-text dark:text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-ink">{t("hub.emptyCatalog.title")}</h2>
          <p className="max-w-md text-sm text-muted">{t("hub.emptyCatalog.body")}</p>
        </div>
      ) : isNoMatch ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card px-6 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-strip">
            <SearchX size={26} className="text-maroon-text dark:text-accent" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-ink">{t("hub.noMatch.title")}</h2>
          <p className="max-w-md text-sm text-muted">{t("hub.noMatch.body")}</p>
          <Button type="button" variant="secondary" onClick={clearSearchAndFilters} className="mt-2 min-h-[44px] min-w-[44px]">
            {t("hub.noMatch.clear")}
          </Button>
        </div>
      ) : hasRows ? (
        <ul
          aria-label={t("hub.listLabel")}
          className="divide-y divide-border overflow-hidden rounded-2xl border border-border-warm bg-card"
        >
          {visibleCourses.map((course) => (
            <JournalListRow
              key={course.id}
              course={course}
              mentorState={resolveMentorState(course.mentor_id)}
              onNavigateOut={recordNavigationOut}
            />
          ))}
        </ul>
      ) : null}

      {isSettled && coursesPage && coursesPage.total_pages > 1 ? (
        <div className="flex justify-center pt-2">
          <CoursePagination page={page} totalPages={coursesPage.total_pages} onPageChange={handlePageChange} />
        </div>
      ) : null}
    </div>
  );
}
