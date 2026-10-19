import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { RefreshCw, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuditEventRow } from "../components/audit/AuditEventRow";
import { AuditInspector } from "../components/audit/AuditInspector";
import { AuditToolbar, type AuditFilterChange } from "../components/audit/AuditToolbar";
import { useAuditNavigation } from "../components/audit/useAuditNavigation";
import { Button } from "../components/ui/Button";
import { InfoTooltip } from "../components/ui/InfoTooltip";
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
    <div className="@container mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-8">
      <PageHeader
        titleIcon={<ScrollText size={24} aria-hidden="true" className="shrink-0 text-maroon dark:text-accent" />}
        title={
          <span ref={headingRef} tabIndex={-1} className="focus-visible:outline-none">
            {t("audit:title")}
          </span>
        }
        info={<InfoTooltip label={t("audit:title")}>{t("audit:titleInfo")}</InfoTooltip>}
        actions={
          <Button variant="secondary" aria-label={t("audit:refresh")} title={t("audit:refresh")} onClick={() => void logs.refetch()} className="shrink-0 px-3">
            <RefreshCw size={18} aria-hidden="true" className={logs.isFetching ? "motion-safe:animate-spin" : ""} />
          </Button>
        }
      />
      <AuditToolbar
        view={state}
        searchDraft={searchDraft}
        options={filterOptions.data}
        onSearchChange={setSearchDraft}
        onChangeFilters={changeFilters}
        onClearAll={clearAll}
      />
      <p role="status" ref={announcementRef} className="sr-only" />
      {logs.data && (
        <p className="text-sm text-label tabular-nums" aria-live="polite">
          {t("audit:total", { total: formatNumber(total, i18n.language) })}
        </p>
      )}
      {logs.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("audit:states.loading")}</span>
          <ul aria-hidden="true" className="divide-y divide-border rounded-2xl border border-border bg-card motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className="flex min-h-[4.5rem] items-start gap-3 px-4 py-3">
                <div className="h-9 w-9 shrink-0 rounded-[10px] bg-strip" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-3/4 rounded bg-strip" />
                  <div className="h-4 w-1/2 rounded bg-strip" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : !logs.data ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-destructive">{t("audit:states.error")}</p>
          {retry}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted">{t(hasFilters ? "audit:states.noMatch" : "audit:states.empty")}</p>
          {hasFilters && (
            <Button variant="secondary" onClick={clearAll}>
              {t("audit:states.clear")}
            </Button>
          )}
        </div>
      ) : (
        <div aria-busy={logs.isPlaceholderData} className={`flex flex-col gap-4 ${logs.isPlaceholderData ? "opacity-70" : ""}`}>
          {logs.isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-warning-surface px-4 py-2 text-sm text-warning">
              <p>{t("audit:states.refreshFailed")}</p>
              {retry}
            </div>
          )}
          {groups.map((group) => (
            <section key={group.day} aria-labelledby={`audit-day-${group.day}`}>
              <h2
                id={`audit-day-${group.day}`}
                className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 bg-cream px-1 py-2 text-sm font-semibold text-label tabular-nums"
              >
                {dayHeading(group.day)}
              </h2>
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {group.items.map((event) => (
                  <AuditEventRow key={event.id} event={event} onOpen={openInspector} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {logs.data && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-label tabular-nums">
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
    </div>
  );
}
