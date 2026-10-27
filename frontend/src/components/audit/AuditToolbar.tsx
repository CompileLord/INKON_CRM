import { useEffect, useRef } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { AuditFilterOptions, KnownAuditAction } from "../../lib/audit/api";
import { AuditUrlState, type AuditViewState } from "../../lib/audit/auditUrlState";
import { AUDIT_CATEGORIES, type AuditCategory } from "../../lib/audit/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SegmentedControl, type SegmentedOption } from "../ui/SegmentedControl";
import { AUDIT_CATEGORY_ICONS } from "./AuditCategoryIcon";
import { FilterChip } from "../finance/FilterChip";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import { PaymentDateRangePicker } from "../finance/PaymentDateRangePicker";
import { useAuditLabels } from "./useAuditLabels";

export type AuditFilterChange = Partial<Pick<AuditViewState, "actorId" | "action" | "entityType" | "entityId" | "dateFrom" | "dateTo" | "category">>;

interface AuditToolbarProps {
  view: AuditViewState;
  searchDraft: string;
  options: AuditFilterOptions | undefined;
  onSearchChange: (value: string) => void;
  onChangeFilters: (filters: AuditFilterChange) => void;
  onClearAll: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function AuditToolbar({ view, searchDraft, options, onSearchChange, onChangeFilters, onClearAll, onRefresh, isRefreshing }: AuditToolbarProps) {
  const { t, i18n } = useTranslation("audit");
  const labels = useAuditLabels();
  const language: string = i18n.language;
  const actors = options?.actors ?? [];
  const entityTypes: string[] = options?.entity_types ?? [];
  const knownEntityTypes: string[] = view.entityType !== null && !entityTypes.includes(view.entityType) ? [...entityTypes, view.entityType] : entityTypes;

  const categoryScroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    categoryScroller.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [view.category]);

  const categoryOptions: SegmentedOption[] = [
    { value: "", label: t("categories.all") },
    ...AUDIT_CATEGORIES.map((category) => {
      const Icon = AUDIT_CATEGORY_ICONS[category];
      return { value: category, label: t(`categories.${category}`), icon: <Icon size={16} aria-hidden="true" className="shrink-0 max-sm:hidden" /> };
    }),
  ];

  const actorOptions: ListboxOption[] = [{ value: "", label: t("filters.allActors") }, ...actors.map((actor) => ({ value: String(actor.id), label: actor.name }))];
  const actionOptions: ListboxOption[] = [
    { value: "", label: t("filters.allActions") },
    ...AuditUrlState.actions.map((action) => ({ value: action, label: labels.actionLabel(action) })),
  ];
  const entityOptions: ListboxOption[] = [
    { value: "", label: t("filters.allEntities") },
    ...knownEntityTypes.map((entityType) => ({ value: entityType, label: labels.entityLabel(entityType) })),
  ];

  const actorName: string | null = view.actorId === null ? null : (actors.find((actor) => actor.id === view.actorId)?.name ?? t("filters.actorUnavailable"));
  const dateChipLabel: string | null =
    view.dateFrom && view.dateTo
      ? t("chips.dates", { from: formatDate(view.dateFrom, language, SCHOOL_TIMEZONE), to: formatDate(view.dateTo, language, SCHOOL_TIMEZONE) })
      : view.dateFrom
        ? t("chips.from", { date: formatDate(view.dateFrom, language, SCHOOL_TIMEZONE) })
        : view.dateTo
          ? t("chips.to", { date: formatDate(view.dateTo, language, SCHOOL_TIMEZONE) })
          : null;
  const hasChips: boolean = AuditUrlState.hasFilters({ ...view, search: "", category: null });
  const removeLabel = (filter: string): string => t("chips.remove", { filter });

  const chipFor = (label: string, onRemove: () => void) => <FilterChip key={label} label={label} removeLabel={removeLabel(label)} onRemove={onRemove} />;

  return (
    <div className="flex flex-col gap-3">
      <div ref={categoryScroller} className="max-w-full overflow-x-auto [&>div]:max-w-none [&_button]:shrink-0 [&_button]:whitespace-nowrap max-sm:[&_button]:px-2">
        <SegmentedControl
          ariaLabel={t("categories.label")}
          options={categoryOptions}
          value={view.category ?? ""}
          onChange={(value) => onChangeFilters({ category: value === "" ? null : (value as AuditCategory) })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Input
            type="search"
            value={searchDraft}
            maxLength={AuditUrlState.maximumSearchLength}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            autoComplete="off"
            leftAddon={<Search size={16} aria-hidden="true" />}
          />
        </div>
        <ListboxPicker
          label={t("filters.actor")}
          icon={null}
          options={actorOptions}
          value={view.actorId === null ? "" : String(view.actorId)}
          onChange={(value) => onChangeFilters({ actorId: value === "" ? null : Number(value) })}
        />
        <ListboxPicker
          label={t("filters.action")}
          icon={null}
          options={actionOptions}
          value={view.action ?? ""}
          onChange={(value) => onChangeFilters({ action: value === "" ? null : (value as KnownAuditAction) })}
        />
        <ListboxPicker
          label={t("filters.entity")}
          icon={null}
          options={entityOptions}
          value={view.entityType ?? ""}
          onChange={(value) => onChangeFilters({ entityType: value === "" ? null : value, entityId: null })}
        />
        <PaymentDateRangePicker title={t("filters.dateTitle")} range={{ from: view.dateFrom, to: view.dateTo }} onApply={(range) => onChangeFilters({ dateFrom: range.from, dateTo: range.to })} />
        <Button variant="secondary" aria-label={t("refresh")} title={t("refresh")} onClick={onRefresh} className="px-3">
          <RefreshCw size={18} aria-hidden="true" className={isRefreshing ? "motion-safe:animate-spin" : ""} />
        </Button>
      </div>
      {hasChips && (
        <div className="flex flex-wrap items-center gap-2">
          {actorName !== null && chipFor(t("chips.actor", { name: actorName }), () => onChangeFilters({ actorId: null }))}
          {view.action !== null && chipFor(labels.actionLabel(view.action), () => onChangeFilters({ action: null }))}
          {view.entityType !== null &&
            (view.entityId !== null
              ? chipFor(t("chips.record", { entity: labels.entityLabel(view.entityType).toLowerCase() }), () => onChangeFilters({ entityType: null, entityId: null }))
              : chipFor(labels.entityLabel(view.entityType), () => onChangeFilters({ entityType: null })))}
          {dateChipLabel !== null && chipFor(dateChipLabel, () => onChangeFilters({ dateFrom: null, dateTo: null }))}
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("chips.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}
