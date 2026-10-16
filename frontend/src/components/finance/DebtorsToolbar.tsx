import { Clock, Search, UserCheck } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { DebtorsViewState } from "../../lib/finance/urlState";
import type { EnrollmentStatus } from "../../lib/finance/types";
import { InfoTooltip } from "../ui/InfoTooltip";
import { FilterChip } from "./FilterChip";
import { ListboxPicker, type ListboxOption } from "./ListboxPicker";

const OVERDUE_THRESHOLDS: readonly number[] = [1, 7, 30, 60, 90];
const STATUSES: readonly EnrollmentStatus[] = ["active", "withdrawn", "completed"];

interface DebtorsToolbarProps {
  view: DebtorsViewState;
  search: string;
  courseLabel: string | null;
  studentLabel: string | null;
  onSearchChange: (value: string) => void;
  onChangeFilters: (filters: Partial<Omit<DebtorsViewState, "page">>) => void;
}

export function DebtorsToolbar({ view, search, courseLabel, studentLabel, onSearchChange, onChangeFilters }: DebtorsToolbarProps) {
  const { t } = useTranslation("finance");
  const searchId: string = useId();
  const statusLabel = (status: EnrollmentStatus): string => t(`debtorsTab.status${status[0].toUpperCase()}${status.slice(1)}`);
  const overdueOptions: ListboxOption[] = [
    { value: "", label: t("debtorsTab.any") },
    ...OVERDUE_THRESHOLDS.map((days) => ({ value: String(days), label: t("debtorsTab.overdueAtLeast", { count: days }) })),
  ];
  const statusOptions: ListboxOption[] = [
    { value: "", label: t("debtorsTab.any") },
    ...STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
  ];
  const hasFilters: boolean = view.courseId !== null || view.studentId !== null || view.overdueDays !== null || view.enrollmentStatus !== null;

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full @[40rem]:max-w-xs">
          <div className="flex items-center gap-1">
            <label htmlFor={searchId} className="text-sm font-medium text-label">
              {t("debtorsTab.searchLabel")}
            </label>
            <InfoTooltip label={t("overview.aboutMetric", { label: t("debtorsTab.searchLabel") })}>{t("debtorsTab.searchInfo")}</InfoTooltip>
          </div>
          <div className="relative mt-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("debtorsTab.searchPlaceholder")}
              autoComplete="off"
              className="min-h-12 w-full rounded-[10px] border border-control-border bg-card py-2 pl-9 pr-3 text-base text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <ListboxPicker
          label={t("debtorsTab.overdueLabel")}
          icon={<Clock size={16} />}
          options={overdueOptions}
          value={view.overdueDays === null ? "" : String(view.overdueDays)}
          onChange={(value) => onChangeFilters({ overdueDays: value === "" ? null : Number(value) })}
        />
        <ListboxPicker
          label={t("debtorsTab.statusLabel")}
          icon={<UserCheck size={16} />}
          options={statusOptions}
          value={view.enrollmentStatus ?? ""}
          onChange={(value) => onChangeFilters({ enrollmentStatus: value === "" ? null : (value as EnrollmentStatus) })}
        />
      </div>
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {courseLabel !== null && (
            <FilterChip label={courseLabel} removeLabel={t("debtorsFilter.clearLabel")} onRemove={() => onChangeFilters({ courseId: null })} />
          )}
          {studentLabel !== null && (
            <FilterChip label={studentLabel} removeLabel={t("debtorsFilter.clearStudentLabel")} onRemove={() => onChangeFilters({ studentId: null, studentName: null })} />
          )}
          {view.overdueDays !== null && (
            <FilterChip
              label={t("debtorsTab.chipOverdue", { count: view.overdueDays })}
              removeLabel={t("debtorsTab.removeFilter", { filter: t("debtorsTab.chipOverdue", { count: view.overdueDays }) })}
              onRemove={() => onChangeFilters({ overdueDays: null })}
            />
          )}
          {view.enrollmentStatus !== null && (
            <FilterChip
              label={t("debtorsTab.chipStatus", { status: statusLabel(view.enrollmentStatus) })}
              removeLabel={t("debtorsTab.removeFilter", { filter: t("debtorsTab.chipStatus", { status: statusLabel(view.enrollmentStatus) }) })}
              onRemove={() => onChangeFilters({ enrollmentStatus: null })}
            />
          )}
          <button
            type="button"
            onClick={() => onChangeFilters({ courseId: null, studentId: null, studentName: null, overdueDays: null, enrollmentStatus: null })}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-sm font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("debtorsTab.clearFilters")}
          </button>
        </div>
      )}
    </div>
  );
}
