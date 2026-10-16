import { Activity, Layers, Search, User } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import type { AuditFilterOptions, KnownAuditAction } from "../../lib/audit/api";
import { AuditUrlState, type AuditViewState } from "../../lib/audit/auditUrlState";
import { InfoTooltip } from "../ui/InfoTooltip";
import { FilterChip } from "../finance/FilterChip";
import { ListboxPicker, type ListboxOption } from "../finance/ListboxPicker";
import { PaymentDateRangePicker } from "../finance/PaymentDateRangePicker";
import { useAuditLabels } from "./useAuditLabels";

export type AuditFilterChange = Partial<Pick<AuditViewState, "actorId" | "action" | "entityType" | "entityId" | "dateFrom" | "dateTo">>;

interface AuditToolbarProps {
  view: AuditViewState;
  searchDraft: string;
  options: AuditFilterOptions | undefined;
  onSearchChange: (value: string) => void;
  onChangeFilters: (filters: AuditFilterChange) => void;
  onClearAll: () => void;
}

export function AuditToolbar({ view, searchDraft, options, onSearchChange, onChangeFilters, onClearAll }: AuditToolbarProps) {
  const { t, i18n } = useTranslation("audit");
  const labels = useAuditLabels();
  const searchId: string = useId();
  const language: string = i18n.language;
  const actors = options?.actors ?? [];
  const entityTypes: string[] = options?.entity_types ?? [];
  const knownEntityTypes: string[] = view.entityType !== null && !entityTypes.includes(view.entityType) ? [...entityTypes, view.entityType] : entityTypes;

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
  const hasChips: boolean = AuditUrlState.hasFilters({ ...view, search: "" });
  const removeLabel = (filter: string): string => t("chips.remove", { filter });

  const chipFor = (label: string, onRemove: () => void) => <FilterChip key={label} label={label} removeLabel={removeLabel(label)} onRemove={onRemove} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full @[40rem]:max-w-xs">
          <div className="flex items-center gap-1">
            <label htmlFor={searchId} className="text-sm font-medium text-label">
              {t("searchLabel")}
            </label>
            <InfoTooltip label={t("searchLabel")}>{t("searchInfo")}</InfoTooltip>
          </div>
          <div className="relative mt-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id={searchId}
              type="search"
              value={searchDraft}
              maxLength={AuditUrlState.maximumSearchLength}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
              className="min-h-12 w-full rounded-[10px] border border-control-border bg-card py-2 pl-9 pr-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <ListboxPicker
          label={t("filters.actor")}
          icon={<User size={16} />}
          options={actorOptions}
          value={view.actorId === null ? "" : String(view.actorId)}
          onChange={(value) => onChangeFilters({ actorId: value === "" ? null : Number(value) })}
        />
        <ListboxPicker
          label={t("filters.action")}
          icon={<Activity size={16} />}
          options={actionOptions}
          value={view.action ?? ""}
          onChange={(value) => onChangeFilters({ action: value === "" ? null : (value as KnownAuditAction) })}
        />
        <ListboxPicker
          label={t("filters.entity")}
          icon={<Layers size={16} />}
          options={entityOptions}
          value={view.entityType ?? ""}
          onChange={(value) => onChangeFilters({ entityType: value === "" ? null : value, entityId: null })}
        />
        <PaymentDateRangePicker title={t("filters.dateTitle")} range={{ from: view.dateFrom, to: view.dateTo }} onApply={(range) => onChangeFilters({ dateFrom: range.from, dateTo: range.to })} />
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
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-sm font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("chips.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}
