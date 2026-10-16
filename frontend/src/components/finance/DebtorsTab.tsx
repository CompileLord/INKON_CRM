import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebts } from "../../lib/finance/hooks";
import { FinanceUrlState, type DebtorsViewState } from "../../lib/finance/urlState";
import type { DebtItem, PaymentItem } from "../../lib/finance/types";
import { CourseBalanceIdentity } from "../../lib/finance/courseBalanceIdentity";
import { formatNumber } from "../../i18n/formatters";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Pagination } from "../ui/Pagination";
import { DebtorRow } from "./DebtorRow";
import { DebtorsToolbar } from "./DebtorsToolbar";
import { useElementWidth } from "./useElementWidth";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;
const TABLE_MINIMUM_WIDTH_PIXELS: number = 840;

interface DebtorsTabProps {
  view: DebtorsViewState;
  recordedPayment: PaymentItem | null;
  onPageChange: (page: number) => void;
  onChangeFilters: (filters: Partial<Omit<DebtorsViewState, "page">>) => void;
  onAcceptPayment: (debt: DebtItem) => void;
}

function rowKeyOf(debt: DebtItem): string {
  return `${debt.student.id}-${debt.course.id}`;
}

export function DebtorsTab({ view, recordedPayment, onPageChange, onChangeFilters, onAcceptPayment }: DebtorsTabProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [sectionRef, sectionWidth] = useElementWidth<HTMLElement>();
  const headingRef = useRef<HTMLSpanElement>(null);
  const pendingRowKey = useRef<string | null>(null);
  const pendingRowIndex = useRef<number>(0);
  const handledPaymentId = useRef<number | null>(null);
  const [search, setSearch] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(new Set());
  const announcementRef = useRef<HTMLParagraphElement>(null);

  const debts = useDebts(view.page, PAGE_SIZE, FinanceUrlState.debtFilters(view));
  const loaded: DebtItem[] = debts.data?.items ?? [];
  const normalizedSearch: string = search.trim().toLowerCase();
  const visible: DebtItem[] = normalizedSearch
    ? loaded.filter((debt) => `${debt.student.first_name} ${debt.student.last_name} ${debt.course.title}`.toLowerCase().includes(normalizedSearch))
    : loaded;
  const total: number = debts.data?.total ?? 0;
  const totalPages: number = debts.data?.total_pages ?? 1;
  const lastValidPage: number = Math.max(1, totalPages);
  const layout: "table" | "list" = sectionWidth >= TABLE_MINIMUM_WIDTH_PIXELS ? "table" : "list";
  const ambiguousStudents: Set<number> = CourseBalanceIdentity.studentIdsSharingAName(loaded);
  const courseTitle: string | undefined = loaded.find((debt) => debt.course.id === view.courseId)?.course.title;
  const courseLabel: string | null =
    view.courseId === null
      ? null
      : t("finance:debtorsFilter.courseDebts", {
          course: courseTitle ?? t("finance:analytics.courseNumber", { id: formatNumber(view.courseId, i18n.language) }),
        });
  const matchedStudentRow: DebtItem | undefined = loaded.find((debt) => debt.student.id === view.studentId);
  const studentName: string | undefined = matchedStudentRow ? CourseBalanceIdentity.displayName(matchedStudentRow) : undefined;
  const studentLabel: string | null =
    view.studentId === null ? null : t("finance:debtorsFilter.studentDebts", { student: studentName ?? view.studentName ?? t("finance:row.unknownStudent") });
  const hasServerFilters: boolean = view.courseId !== null || view.studentId !== null || view.overdueDays !== null || view.enrollmentStatus !== null;
  const firstRecord: number = (view.page - 1) * PAGE_SIZE + 1;

  useEffect(() => {
    if (debts.data && view.page > lastValidPage) {
      if (announcementRef.current) announcementRef.current.textContent = t("finance:debtorsTab.pageCorrected");
      onPageChange(lastValidPage);
    }
  }, [debts.data, view.page, lastValidPage, onPageChange, t]);

  useEffect(() => {
    if (!recordedPayment || handledPaymentId.current === recordedPayment.id || debts.isFetching || !debts.data) return;
    handledPaymentId.current = recordedPayment.id;
    const key: string | null = pendingRowKey.current;
    pendingRowKey.current = null;
    if (key === null || debts.data.items.some((debt) => rowKeyOf(debt) === key)) return;
    const rows: NodeListOf<HTMLElement> | undefined = sectionRef.current?.querySelectorAll<HTMLElement>("[data-row-key]");
    const target: HTMLElement | undefined = rows && rows.length > 0 ? rows[Math.min(pendingRowIndex.current, rows.length - 1)] : undefined;
    const focusable: HTMLElement | null | undefined = target?.querySelector<HTMLElement>("button, a");
    (focusable ?? headingRef.current)?.focus();
  }, [recordedPayment, debts.data, debts.isFetching, sectionRef]);

  const acceptPayment = (debt: DebtItem): void => {
    pendingRowKey.current = rowKeyOf(debt);
    pendingRowIndex.current = Math.max(0, visible.findIndex((candidate) => rowKeyOf(candidate) === rowKeyOf(debt)));
    onAcceptPayment(debt);
  };

  const toggleDetails = (rowKey: string): void => {
    setExpandedRows((current) => {
      const next: Set<string> = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const rows = visible.map((debt) => {
    const rowKey: string = rowKeyOf(debt);
    return (
      <DebtorRow
        key={rowKey}
        debt={debt}
        rowKey={rowKey}
        layout={layout}
        showStudentNumber={ambiguousStudents.has(debt.student.id)}
        canOpenProfile={role === "superadmin"}
        isExpanded={expandedRows.has(rowKey)}
        onToggleDetails={toggleDetails}
        onAcceptPayment={acceptPayment}
      />
    );
  });

  const retry = (
    <Button variant="secondary" loading={debts.isFetching} onClick={() => void debts.refetch()}>
      {t("common:retry")}
    </Button>
  );

  return (
    <section ref={sectionRef} aria-labelledby="finance-debtors-heading" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Users size={18} aria-hidden="true" />
          <span id="finance-debtors-heading" ref={headingRef} tabIndex={-1} className="focus-visible:outline-none">
            {t("finance:debtors.title")}
          </span>
          <InfoTooltip label={t("finance:overview.aboutMetric", { label: t("finance:debtors.title") })}>{t("finance:debtors.info")}</InfoTooltip>
        </h2>
        {debts.data && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-label tabular-nums">
            <span>{t("finance:debtorsTab.total", { total: formatNumber(total, i18n.language) })}</span>
            {normalizedSearch && (
              <span>
                {t("finance:debtorsTab.pageMatches", {
                  shown: formatNumber(visible.length, i18n.language),
                  loaded: formatNumber(loaded.length, i18n.language),
                })}
              </span>
            )}
          </p>
        )}
      </div>
      <DebtorsToolbar view={view} search={search} courseLabel={courseLabel} studentLabel={studentLabel} onSearchChange={setSearch} onChangeFilters={onChangeFilters} />
      <p role="status" ref={announcementRef} className="sr-only" />
      {debts.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("finance:courseBalances.loading")}</span>
          <ul aria-hidden="true" className="divide-y divide-border motion-safe:animate-pulse">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index} className={layout === "table" ? "h-[4.5rem] px-4 py-3" : "h-[7.5rem] px-4 py-3"}>
                <div className="h-full rounded-lg bg-strip" />
              </li>
            ))}
          </ul>
        </div>
      ) : !debts.data ? (
        <div role="alert" className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-destructive">{t("finance:debtorsTab.error")}</p>
          {retry}
        </div>
      ) : loaded.length === 0 ? (
        <div className="p-4">
          <p className="text-sm text-muted">
            {t(view.studentId !== null ? "finance:debtorsFilter.studentMissing" : hasServerFilters ? "finance:debtorsTab.noMatchFilters" : "finance:debtorsTab.empty")}
          </p>
          {view.studentId !== null && (
            <Button variant="secondary" className="mt-3" onClick={() => navigate(-1)}>
              {t("finance:debtorsFilter.back")}
            </Button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-muted">{t("finance:debtorsTab.noMatchPage")}</p>
          <Button variant="secondary" onClick={() => setSearch("")}>
            {t("finance:debtorsTab.clearSearch")}
          </Button>
        </div>
      ) : (
        <>
          {debts.isError && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning-surface px-4 py-2 text-sm text-warning">
              <p>{t("finance:refreshFailed")}</p>
              {retry}
            </div>
          )}
          {layout === "table" ? (
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-border bg-strip text-xs text-label">
                  <th scope="col" className="w-[40%] px-4 py-2 font-medium">{t("finance:debtorsTab.columnStudent")}</th>
                  <th scope="col" className="w-[20%] px-3 py-2 text-right font-medium">{t("finance:debtorsTab.columnDue")}</th>
                  <th scope="col" className="w-[15%] px-3 py-2 font-medium">{t("finance:debtorsTab.columnOverdue")}</th>
                  <th scope="col" className="w-[25%] px-3 py-2 font-medium">
                    <span className="sr-only">{t("finance:debtorsTab.columnActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">{rows}</tbody>
            </table>
          ) : (
            <ul className="divide-y divide-border">{rows}</ul>
          )}
        </>
      )}
      {debts.data && loaded.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
          <p className="text-sm text-label tabular-nums">
            {t("finance:debtorsTab.range", {
              from: formatNumber(firstRecord, i18n.language),
              to: formatNumber(firstRecord + loaded.length - 1, i18n.language),
              total: formatNumber(total, i18n.language),
            })}
          </p>
          {totalPages > 1 && <Pagination page={view.page} totalPages={totalPages} onPageChange={onPageChange} />}
        </div>
      )}
    </section>
  );
}
