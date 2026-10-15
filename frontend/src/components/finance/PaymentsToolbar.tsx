import { Banknote } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PaymentMethod } from "../../lib/finance/types";
import { FinanceUrlState, type PaymentsViewState } from "../../lib/finance/urlState";
import { formatDate, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { FilterChip } from "./FilterChip";
import { ListboxPicker, type ListboxOption } from "./ListboxPicker";
import { PaymentDateRangePicker } from "./PaymentDateRangePicker";
import { PaymentStudentFilter } from "./PaymentStudentFilter";

type PaymentsFilterChange = Partial<Omit<PaymentsViewState, "page">>;

interface PaymentsToolbarProps {
  view: PaymentsViewState;
  courseLabel: string | null;
  studentLabel: string | null;
  onChangeFilters: (filters: PaymentsFilterChange) => void;
}

const CLEARED_FILTERS: PaymentsFilterChange = {
  courseId: null,
  method: null,
  studentId: null,
  studentName: null,
  dateFrom: null,
  dateTo: null,
};

export function PaymentsToolbar({ view, courseLabel, studentLabel, onChangeFilters }: PaymentsToolbarProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const methodOptions: ListboxOption[] = [
    { value: "", label: t("finance:paymentsTab.all") },
    ...FinanceUrlState.paymentMethods.map((method) => ({ value: method, label: t(`common:enums.paymentMethod.${method}`) })),
  ];
  const day = (value: string): string => formatDate(value, i18n.language, SCHOOL_TIMEZONE);
  const dateChipLabel: string | null =
    view.dateFrom && view.dateTo
      ? t("finance:paymentsTab.chipDates", { from: day(view.dateFrom), to: day(view.dateTo) })
      : view.dateFrom
        ? t("finance:paymentsTab.dateFromOnly", { date: day(view.dateFrom) })
        : view.dateTo
          ? t("finance:paymentsTab.dateToOnly", { date: day(view.dateTo) })
          : null;
  const methodChipLabel: string | null = view.method ? t("finance:paymentsTab.chipMethod", { method: t(`common:enums.paymentMethod.${view.method}`) }) : null;
  const removeLabel = (filter: string): string => t("finance:debtorsTab.removeFilter", { filter });

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <PaymentStudentFilter
          studentName={studentLabel}
          onSelect={(student) => onChangeFilters({ studentId: student.id, studentName: `${student.first_name} ${student.last_name}`.slice(0, FinanceUrlState.maximumStudentNameLength) })}
        />
        <ListboxPicker
          label={t("finance:paymentsTab.methodLabel")}
          icon={<Banknote size={16} />}
          options={methodOptions}
          value={view.method ?? ""}
          onChange={(value) => onChangeFilters({ method: value === "" ? null : (value as PaymentMethod) })}
        />
        <PaymentDateRangePicker range={{ from: view.dateFrom, to: view.dateTo }} onApply={(range) => onChangeFilters({ dateFrom: range.from, dateTo: range.to })} />
      </div>
      {FinanceUrlState.hasPaymentFilters(view) && (
        <div className="flex flex-wrap items-center gap-2">
          {view.studentId !== null && studentLabel !== null && (
            <FilterChip label={studentLabel} removeLabel={removeLabel(studentLabel)} onRemove={() => onChangeFilters({ studentId: null, studentName: null })} />
          )}
          {view.courseId !== null && courseLabel !== null && (
            <FilterChip label={courseLabel} removeLabel={removeLabel(courseLabel)} onRemove={() => onChangeFilters({ courseId: null })} />
          )}
          {methodChipLabel !== null && <FilterChip label={methodChipLabel} removeLabel={removeLabel(methodChipLabel)} onRemove={() => onChangeFilters({ method: null })} />}
          {dateChipLabel !== null && <FilterChip label={dateChipLabel} removeLabel={removeLabel(dateChipLabel)} onRemove={() => onChangeFilters({ dateFrom: null, dateTo: null })} />}
          <button
            type="button"
            onClick={() => onChangeFilters(CLEARED_FILTERS)}
            className="inline-flex min-h-11 items-center rounded-[10px] px-2 text-sm font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("finance:debtorsTab.clearFilters")}
          </button>
        </div>
      )}
    </div>
  );
}

export { CLEARED_FILTERS as CLEARED_PAYMENT_FILTERS };
