import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDebts, useQueueDebtReminders } from "../../lib/finance/hooks";
import { FinanceUrlState, type DebtorsViewState } from "../../lib/finance/urlState";
import type { DebtItem, PaymentItem } from "../../lib/finance/types";
import { CourseBalanceIdentity } from "../../lib/finance/courseBalanceIdentity";
import { formatDateTime, formatNumber } from "../../i18n/formatters";
import { DebtReminders } from "../../lib/finance/debtReminders";
import type { DebtReminderResult } from "../../lib/finance/types";
import { AuthApiError } from "../../lib/auth/errors";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";
import { Pagination } from "../ui/Pagination";
import { DebtorRow } from "./DebtorRow";
import { DebtorsToolbar } from "./DebtorsToolbar";

const PAGE_SIZE: number = 20;
const SKELETON_ROWS: number = 6;

interface DebtorsTabProps {
  view: DebtorsViewState;
  recordedPayment: PaymentItem | null;
  onPageChange: (page: number) => void;
  onChangeFilters: (filters: Partial<Omit<DebtorsViewState, "page">>) => void;
  onAcceptPayment: (debt: DebtItem) => void;
  renderRowAction?: (debt: DebtItem) => ReactNode;
  toolbarAction?: ReactNode;
}

function rowKeyOf(debt: DebtItem): string {
  return `${debt.student.id}-${debt.course.id}`;
}

export function DebtorsTab({ view, recordedPayment, onPageChange, onChangeFilters, onAcceptPayment, renderRowAction, toolbarAction }: DebtorsTabProps) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLSpanElement>(null);
  const pendingRowKey = useRef<string | null>(null);
  const pendingRowIndex = useRef<number>(0);
  const handledPaymentId = useRef<number | null>(null);
  const [search, setSearch] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<ReadonlySet<string>>(new Set());
  const [reminderFeedback, setReminderFeedback] = useState<{ message: string; failed: boolean } | null>(null);
  const [bulkRunning, setBulkRunning] = useState<boolean>(false);
  const [remindingIds, setRemindingIds] = useState<ReadonlySet<number>>(new Set());
  const queueReminders = useQueueDebtReminders();
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
    const focusable: HTMLElement | null | undefined = target?.querySelector<HTMLElement>("button:not(:disabled), a");
    (focusable ?? headingRef.current)?.focus();
  }, [recordedPayment, debts.data, debts.isFetching]);

  const acceptPayment = (debt: DebtItem): void => {
    pendingRowKey.current = rowKeyOf(debt);
    pendingRowIndex.current = Math.max(0, visible.findIndex((candidate) => rowKeyOf(candidate) === rowKeyOf(debt)));
    onAcceptPayment(debt);
  };

  const sendReminders = async (studentIds: number[], single: DebtItem | null): Promise<void> => {
    setReminderFeedback(null);
    setRemindingIds(new Set(studentIds));
    setBulkRunning(single === null);
    try {
      const response = await queueReminders.mutateAsync(studentIds);
      setReminderFeedback({ message: describeReminders(response.results, single), failed: false });
    } catch (error) {
      setReminderFeedback({ message: describeReminderFailure(error), failed: true });
    } finally {
      setRemindingIds(new Set());
      setBulkRunning(false);
    }
  };

  const describeReminderFailure = (error: unknown): string => {
    if (error instanceof AuthApiError) {
      if (error.status === 409) return t("finance:reminders.disabled");
      if (error.status === 429 && error.code === "debt_reminder_rate_limited") {
        const nextAllowedAt: Date = new Date(Date.now() + (error.retryAfterSeconds ?? 0) * 1000);
        return t("finance:reminders.rateLimited", { when: formatDateTime(nextAllowedAt, i18n.language) });
      }
      if (error.status === 422 && error.code === "debt_reminder_no_channel") return t("finance:reminders.noChannelError");
    }
    return t("finance:reminders.failed");
  };

  const describeReminders = (results: DebtReminderResult[], single: DebtItem | null): string => {
    const first: DebtReminderResult | undefined = results[0];
    if (!single || !first) {
      const tally = DebtReminders.tally(results);
      return t("finance:reminders.bulkResult", { queued: formatNumber(tally.queued, i18n.language), skipped: formatNumber(tally.skipped, i18n.language) });
    }
    const student: string = `${single.student.first_name} ${single.student.last_name}`;
    if (first.outcome === "queued") {
      return first.channel === "sms"
        ? t("finance:reminders.queuedSms", { student, destination: (first.masked_destination ?? "").replaceAll(" ", "\u00A0") })
        : t("finance:reminders.queuedTelegram", { student });
    }
    const outcomeKeys: Record<Exclude<DebtReminderResult["outcome"], "queued">, string> = {
      recently_reminded: "recentlyReminded",
      no_parent_chat: "noParentChat",
      no_channel: "noChannelResult",
      no_debt: "noDebt",
      not_found: "notFound",
    };
    return t(`finance:reminders.${outcomeKeys[first.outcome]}`, { student, when: formatDateTime(first.next_allowed_at, i18n.language) });
  };

  const eligibleIds: number[] = DebtReminders.eligibleStudentIds(visible);

  const bulkAction = (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={eligibleIds.length === 0}
        loading={bulkRunning}
        aria-describedby={eligibleIds.length === 0 ? "debtors-bulk-remind-reason" : undefined}
        onClick={() => void sendReminders(eligibleIds, null)}
      >
        {t("finance:reminders.bulk", { count: formatNumber(eligibleIds.length, i18n.language) })}
      </Button>
      {eligibleIds.length === 0 && debts.data && loaded.length > 0 && <p id="debtors-bulk-remind-reason" className="text-xs text-muted">{t("finance:reminders.bulkNone")}</p>}
    </div>
  );

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
        showStudentNumber={ambiguousStudents.has(debt.student.id)}
        canOpenProfile={role === "superadmin"}
        isExpanded={expandedRows.has(rowKey)}
        onToggleDetails={toggleDetails}
        onAcceptPayment={acceptPayment}
        extraAction={renderRowAction?.(debt)}
        onRemind={(target: DebtItem) => void sendReminders([target.student.id], target)}
        isReminding={!bulkRunning && remindingIds.has(debt.student.id)}
      />
    );
  });

  const retry = (
    <Button variant="secondary" loading={debts.isFetching} onClick={() => void debts.refetch()}>
      {t("common:retry")}
    </Button>
  );

  const summary = debts.data ? (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted tabular-nums">
      <span>{t("finance:debtorsTab.total", { total: formatNumber(total, i18n.language) })}</span>
      {normalizedSearch && (
        <span>{t("finance:debtorsTab.pageMatches", { shown: formatNumber(visible.length, i18n.language), loaded: formatNumber(loaded.length, i18n.language) })}</span>
      )}
    </p>
  ) : undefined;

  return (
    <div ref={sectionRef} role="region" aria-labelledby="finance-debtors-heading">
      <SectionCard title={t("finance:debtors.title")} actions={summary}>
        <span id="finance-debtors-heading" ref={headingRef} tabIndex={-1} className="sr-only focus-visible:outline-none">{t("finance:debtors.title")}</span>
        <DebtorsToolbar view={view} search={search} courseLabel={courseLabel} studentLabel={studentLabel} onSearchChange={setSearch} onChangeFilters={onChangeFilters} trailingAction={<>{toolbarAction}{bulkAction}</>} />
        <p role="status" ref={announcementRef} className="sr-only" />
        {reminderFeedback && (
          <p role="status" className={["text-sm", reminderFeedback.failed ? "text-destructive" : "text-ink"].join(" ")}>{reminderFeedback.message}</p>
        )}
        {debts.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("finance:courseBalances.loading")}</span>
            <ul aria-hidden="true" className="flex flex-col motion-safe:animate-pulse">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <li key={index} className="flex items-center justify-between gap-4 px-3 py-3">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-40 max-w-full rounded bg-border" />
                    <div className="h-3 w-56 max-w-full rounded bg-border" />
                  </div>
                  <div className="h-4 w-20 rounded bg-border" />
                </li>
              ))}
            </ul>
          </div>
        ) : !debts.data ? (
          <ErrorState message={t("finance:debtorsTab.error")} onRetry={() => void debts.refetch()} />
        ) : loaded.length === 0 ? (
          <EmptyState
            title={t(view.studentId !== null ? "finance:debtorsFilter.studentMissing" : hasServerFilters ? "finance:debtorsTab.noMatchFilters" : "finance:debtorsTab.empty")}
            action={view.studentId !== null ? <Button variant="secondary" onClick={() => navigate(-1)}>{t("finance:debtorsFilter.back")}</Button> : undefined}
          />
        ) : visible.length === 0 ? (
          <EmptyState title={t("finance:debtorsTab.noMatchPage")} action={<Button variant="secondary" onClick={() => setSearch("")}>{t("finance:debtorsTab.clearSearch")}</Button>} />
        ) : (
          <>
            {debts.isError && (
              <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <p>{t("finance:refreshFailed")}</p>
                {retry}
              </div>
            )}
            <ul className="flex flex-col">{rows}</ul>
          </>
        )}
        {debts.data && loaded.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted tabular-nums">
              {t("finance:debtorsTab.range", {
                from: formatNumber(firstRecord, i18n.language),
                to: formatNumber(firstRecord + loaded.length - 1, i18n.language),
                total: formatNumber(total, i18n.language),
              })}
            </p>
            {totalPages > 1 && <Pagination page={view.page} totalPages={totalPages} onPageChange={onPageChange} />}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
