import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuditClusterList } from "../components/audit/AuditClusterList";
import { AuditInspector } from "../components/audit/AuditInspector";
import { AuditToolbar, type AuditFilterChange } from "../components/audit/AuditToolbar";
import { useAuditNavigation } from "../components/audit/useAuditNavigation";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { Pagination } from "../components/ui/Pagination";
import { formatDate, formatNumber, SCHOOL_TIMEZONE } from "../i18n/formatters";
import type { AuditEvent } from "../lib/audit/api";
import { AuditPresentation, type AuditDayGroup } from "../lib/audit/auditPresentation";
import { AuditUrlState } from "../lib/audit/auditUrlState";
import { useAuditFilterOptions, useAuditEvents } from "../lib/audit/hooks";
import { useDebouncedValue } from "../lib/useDebouncedValue";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 8;
const SEARCH_DEBOUNCE_MILLISECONDS: number = 300;

export function Audit() {
  const { t, i18n } = useTranslation(["audit", "common"]);
  const navigation = useAuditNavigation();
  const { state } = navigation;
  const logs = useAuditEvents(state.page, PAGE_SIZE, AuditUrlState.toFilters(state));
  const filterOptions = useAuditFilterOptions();
  const [searchDraft, setSearchDraft] = useState<string>(state.search);
  const debouncedSearch: string = useDebouncedValue(searchDraft.trim(), SEARCH_DEBOUNCE_MILLISECONDS);
  const lastCommittedSearch = useRef<string>(state.search);
  const [inspected, setInspected] = useState<AuditEvent | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);

  const items: AuditEvent[] = logs.data?.items ?? [];
  const total: number = logs.data?.total ?? 0;
  const totalPages: number = logs.data?.total_pages ?? 1;
  const lastValidPage: number = Math.max(1, totalPages);
  const hasFilters: boolean = AuditUrlState.hasFilters(state);
  const groups: AuditDayGroup[] = AuditPresentation.groupByDay(items);
  const firstRecord: number = (state.page - 1) * PAGE_SIZE + 1;

  useEffect(() => {
    if (state.search !== lastCommittedSearch.current) {
      lastCommittedSearch.current = state.search;
      setSearchDraft(state.search);
    }
  }, [state.search]);

  useEffect(() => {
    if (debouncedSearch !== lastCommittedSearch.current) {
      lastCommittedSearch.current = debouncedSearch;
      navigation.changeFilters({ search: debouncedSearch }, true);
    }
  }, [debouncedSearch, navigation]);

  useEffect(() => {
    if (logs.data && !logs.isPlaceholderData && state.page > lastValidPage) {
      if (announcementRef.current) announcementRef.current.textContent = t("audit:states.pageCorrected");
      navigation.setPage(lastValidPage);
    }
  }, [logs.data, logs.isPlaceholderData, state.page, lastValidPage, navigation, t]);

  const openInspector = (event: AuditEvent, trigger: HTMLButtonElement): void => {
    triggerRef.current = trigger;
    setInspected(event);
  };

  const returnFocusTo = (): HTMLElement | null => {
    const trigger: HTMLButtonElement | null = triggerRef.current;
    return trigger && trigger.isConnected ? trigger : headingRef.current;
  };

  const changeFilters = (filters: AuditFilterChange): void => navigation.changeFilters(filters);

  const clearAll = (): void => {
    lastCommittedSearch.current = "";
    setSearchDraft("");
    navigation.clearAll();
  };

  const showAllForRecord = (event: AuditEvent): void => {
    setInspected(null);
    navigation.changeFilters({ entityType: event.entity_type, entityId: event.entity_id });
  };

  const dayHeading = (day: string): string => {
    const relation = AuditPresentation.relateDay(day);
    if (relation === "today") return t("audit:days.today");
    if (relation === "yesterday") return t("audit:days.yesterday");
    return formatDate(`${day}T12:00:00+05:00`, i18n.language, SCHOOL_TIMEZONE);
  };

  const retry = (
    <Button variant="secondary" loading={logs.isFetching} onClick={() => void logs.refetch()}>
      {t("common:retry")}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title={
          <span ref={headingRef} tabIndex={-1} className="focus-visible:outline-none">
            {t("audit:title")}
          </span>
        }
        count={logs.data ? formatNumber(total, i18n.language) : undefined}
      />
      <AuditToolbar
        view={state}
        searchDraft={searchDraft}
        options={filterOptions.data}
        onSearchChange={setSearchDraft}
        onChangeFilters={changeFilters}
        onClearAll={clearAll}
        onRefresh={() => void logs.refetch()}
        isRefreshing={logs.isFetching}
      />
      <p role="status" ref={announcementRef} className="sr-only" />
      {logs.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("audit:states.loading")}</span>
          <ul aria-hidden="true" className="flex flex-col rounded-2xl border border-border bg-card p-1 motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className="flex min-h-[4.5rem] items-start gap-3 px-3 py-3">
                <div className="size-9 shrink-0 rounded-[10px] bg-border" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-3/4 rounded bg-border" />
                  <div className="h-4 w-1/2 rounded bg-border" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : !logs.data ? (
        <div className="rounded-2xl border border-border bg-card">
          <ErrorState message={t("audit:states.error")} onRetry={() => void logs.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            title={t(!hasFilters ? "audit:states.empty" : state.category !== null ? "audit:states.noMatchCategory" : "audit:states.noMatch")}
            action={hasFilters ? <Button variant="secondary" onClick={clearAll}>{t("audit:states.clear")}</Button> : undefined}
          />
        </div>
      ) : (
        <div aria-busy={logs.isPlaceholderData} className={`flex flex-col gap-4 ${logs.isPlaceholderData ? "opacity-70" : ""}`}>
          {logs.isError && (
            <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <p>{t("audit:states.refreshFailed")}</p>
              {retry}
            </div>
          )}
          {groups.map((group) => (
            <section key={group.day} aria-labelledby={`audit-day-${group.day}`} className="flex flex-col gap-2">
              <h2 id={`audit-day-${group.day}`} className="px-1 text-sm font-semibold text-muted tabular-nums">
                {dayHeading(group.day)}
              </h2>
              <AuditClusterList events={group.items} onOpen={openInspector} />
            </section>
          ))}
        </div>
      )}
      {logs.data && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted tabular-nums">
            {t("audit:range", {
              from: formatNumber(firstRecord, i18n.language),
              to: formatNumber(firstRecord + items.length - 1, i18n.language),
              total: formatNumber(total, i18n.language),
            })}
          </p>
          {totalPages > 1 && <Pagination page={state.page} totalPages={totalPages} onPageChange={navigation.setPage} />}
        </div>
      )}
      <AuditInspector event={inspected} onClose={() => setInspected(null)} onShowRecord={showAllForRecord} returnFocusTo={returnFocusTo} />
    </PageContainer>
  );
}
