import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DebtorsViewState } from "../../lib/finance/urlState";
import type { EnrollmentStatus } from "../../lib/finance/types";
import { Input } from "../ui/Input";
import { FilterChip } from "./FilterChip";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";

const OVERDUE_THRESHOLDS: readonly number[] = [1, 7, 30, 60, 90];
const STATUSES: readonly EnrollmentStatus[] = ["active", "withdrawn", "completed"];

interface DebtorsToolbarProps {
  view: DebtorsViewState;
  search: string;
  courseLabel: string | null;
  studentLabel: string | null;
  onSearchChange: (value: string) => void;
  onChangeFilters: (filters: Partial<Omit<DebtorsViewState, "page">>) => void;
  trailingAction?: ReactNode;
}

export function DebtorsToolbar({ view, search, courseLabel, studentLabel, onSearchChange, onChangeFilters, trailingAction }: DebtorsToolbarProps) {
  const { t } = useTranslation("finance");
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("debtorsTab.searchPlaceholder")}
            aria-label={t("debtorsTab.searchLabel")}
            autoComplete="off"
            leftAddon={<Search size={16} aria-hidden="true" />}
          />
        </div>
        <ListboxPicker
          label={t("debtorsTab.overdueLabel")}
          icon={null}
          options={overdueOptions}
          value={view.overdueDays === null ? "" : String(view.overdueDays)}
          onChange={(value) => onChangeFilters({ overdueDays: value === "" ? null : Number(value) })}
        />
        <ListboxPicker
          label={t("debtorsTab.statusLabel")}
          icon={null}
          options={statusOptions}
          value={view.enrollmentStatus ?? ""}
          onChange={(value) => onChangeFilters({ enrollmentStatus: value === "" ? null : (value as EnrollmentStatus) })}
        />
        {trailingAction !== undefined && <div data-debtors-toolbar-action className="ml-auto">{trailingAction}</div>}
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
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-sm font-medium text-maroon-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("debtorsTab.clearFilters")}
          </button>
        </div>
      )}
    </div>
  );
}
