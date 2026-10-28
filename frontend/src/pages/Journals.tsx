import { useEffect, useMemo, useRef } from "react";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../i18n/formatters";
import { useCourses } from "../lib/courses/hooks";
import { useMentors } from "../lib/users/hooks";
import { parseSafePageParam } from "../lib/courses/returnContext";
import { useAuthStore } from "../store/authStore";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
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
  const { t, i18n } = useTranslation(["journals", "common"]);
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

  const listCard = "flex flex-col rounded-2xl border border-border bg-card p-1";

  return (
    <PageContainer>
      <PageHeader
        title={t("common:nav.journals")}
        count={isSettled && coursesPage && !isTrulyEmptyCatalog ? formatNumber(coursesPage.total, i18n.language) : undefined}
      />

      {isTrulyEmptyCatalog ? null : (
        <JournalsToolbar
          search={search}
          onSearchChange={handleSearchChange}
          status={status}
          onStatusChange={handleStatusChange}
        />
      )}

      {isSettled && coursesPage && !isTrulyEmptyCatalog && (normalizedQuery || isRefreshing) ? (
        <div role="status" className="flex flex-col gap-0.5 text-sm text-muted">
          <span className="tabular-nums">
            {normalizedQuery ? t("hub.searchPageScope", { count: visibleCourses.length, total: coursesPage.items.length }) : null}
            {isRefreshing ? <span>{normalizedQuery ? " · " : null}{t("hub.refreshing")}</span> : null}
          </span>
          {normalizedQuery ? <span>{t("hub.searchScopeNotice")}</span> : null}
        </div>
      ) : null}

      {isRefreshFailed ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{t("hub.refreshFailed")}</span>
          <Button type="button" variant="secondary" onClick={() => refetch()}>{t("common:retry")}</Button>
        </div>
      ) : null}

      {showSkeleton ? (
        <ul aria-busy="true" aria-label={t("hub.listLabel")} className={listCard}>
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <JournalListRowSkeleton key={index} showMentor={isSuperAdmin} />
          ))}
        </ul>
      ) : isHardError ? (
        <div className="rounded-2xl border border-border bg-card">
          <ErrorState message={t("loadFailedHub")} onRetry={() => refetch()} />
        </div>
      ) : isEmptyCatalog ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState title={t("hub.emptyCatalog.title")} description={t("hub.emptyCatalog.body")} />
        </div>
      ) : isNoMatch ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            title={t("hub.noMatch.title")}
            description={t("hub.noMatch.body")}
            action={<Button type="button" variant="secondary" onClick={clearSearchAndFilters}>{t("hub.noMatch.clear")}</Button>}
          />
        </div>
      ) : hasRows ? (
        <ul aria-label={t("hub.listLabel")} className={listCard}>
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
        <div className="flex justify-center">
          <Pagination page={page} totalPages={coursesPage.total_pages} onPageChange={handlePageChange} />
        </div>
      ) : null}
    </PageContainer>
  );
}
