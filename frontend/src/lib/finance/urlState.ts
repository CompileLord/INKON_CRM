import { getSchoolCalendarDate, getSchoolMonthRange } from "../../i18n/formatters";
import type { DebtFilters, PaymentFilters } from "./api";
import type { EnrollmentStatus, PaymentMethod } from "./types";

export type FinanceTab = "overview" | "debtors" | "payments";

export interface CollectionRange {
  from: string;
  to: string;
}

export type RangePreset = "thisMonth" | "lastMonth" | "thisYear";

export type RangeProblem = "incomplete" | "invalid" | "inverted";

export interface DebtorsViewState {
  page: number;
  courseId: number | null;
  overdueDays: number | null;
  enrollmentStatus: EnrollmentStatus | null;
}

export interface PaymentsViewState {
  page: number;
  courseId: number | null;
  method: PaymentMethod | null;
}

export interface FinanceViewState {
  tab: FinanceTab;
  range: CollectionRange | null;
  debtors: DebtorsViewState;
  payments: PaymentsViewState;
}

export class FinanceUrlState {
  static readonly tabs: readonly FinanceTab[] = ["overview", "debtors", "payments"];
  static readonly enrollmentStatuses: readonly EnrollmentStatus[] = ["active", "withdrawn", "completed"];
  static readonly paymentMethods: readonly PaymentMethod[] = ["cash", "transfer"];
  static readonly maximumOverdueDays: number = 3650;

  static parse(params: URLSearchParams): FinanceViewState {
    const rawTab: string | null = params.get("tab");
    const tab: FinanceTab = FinanceUrlState.tabs.find((candidate) => candidate === rawTab) ?? "overview";
    const rawStatus: string | null = params.get("dstatus");
    const rawMethod: string | null = params.get("pmethod");
    return {
      tab,
      range: FinanceUrlState.parseRange(params.get("from"), params.get("to")),
      debtors: {
        page: FinanceUrlState.parsePositiveInteger(params.get("dpage")) ?? 1,
        courseId: FinanceUrlState.parsePositiveInteger(params.get("dcourse")),
        overdueDays: FinanceUrlState.parseOverdueDays(params.get("doverdue")),
        enrollmentStatus: FinanceUrlState.enrollmentStatuses.find((candidate) => candidate === rawStatus) ?? null,
      },
      payments: {
        page: FinanceUrlState.parsePositiveInteger(params.get("ppage")) ?? 1,
        courseId: FinanceUrlState.parsePositiveInteger(params.get("pcourse")),
        method: FinanceUrlState.paymentMethods.find((candidate) => candidate === rawMethod) ?? null,
      },
    };
  }

  static serialize(state: FinanceViewState): URLSearchParams {
    const params: URLSearchParams = new URLSearchParams();
    if (state.tab !== "overview") params.set("tab", state.tab);
    if (state.range) {
      params.set("from", state.range.from);
      params.set("to", state.range.to);
    }
    if (state.debtors.page > 1) params.set("dpage", String(state.debtors.page));
    if (state.debtors.courseId !== null) params.set("dcourse", String(state.debtors.courseId));
    if (state.debtors.overdueDays !== null) params.set("doverdue", String(state.debtors.overdueDays));
    if (state.debtors.enrollmentStatus) params.set("dstatus", state.debtors.enrollmentStatus);
    if (state.payments.page > 1) params.set("ppage", String(state.payments.page));
    if (state.payments.courseId !== null) params.set("pcourse", String(state.payments.courseId));
    if (state.payments.method) params.set("pmethod", state.payments.method);
    return params;
  }

  static defaultState(): FinanceViewState {
    return FinanceUrlState.parse(new URLSearchParams());
  }

  static debtorsLocation(courseId?: number): string {
    const state: FinanceViewState = FinanceUrlState.defaultState();
    state.tab = "debtors";
    if (courseId !== undefined && Number.isSafeInteger(courseId) && courseId > 0) state.debtors.courseId = courseId;
    return "/finance?" + FinanceUrlState.serialize(state).toString();
  }

  static defaultRange(reference: Date = new Date()): CollectionRange {
    const month = getSchoolMonthRange(reference);
    return { from: month.start, to: month.end };
  }

  static presetRange(preset: RangePreset, reference: Date = new Date()): CollectionRange {
    const [year, month] = getSchoolCalendarDate(reference).split("-").map(Number);
    if (preset === "thisMonth") return FinanceUrlState.defaultRange(reference);
    if (preset === "thisYear") return { from: `${year}-01-01`, to: `${year}-12-31` };
    const anchor: Date = new Date(Date.UTC(year, month - 2, 1));
    const lastDay: number = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
    const prefix: string = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
    return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, "0")}` };
  }

  static isWholeMonth(range: CollectionRange): boolean {
    const [year, month] = range.from.split("-").map(Number);
    const lastDay: number = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return range.from.endsWith("-01") && range.to === `${range.from.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
  }

  static resolveRange(range: CollectionRange | null, reference: Date = new Date()): CollectionRange {
    return range ?? FinanceUrlState.defaultRange(reference);
  }

  static isCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const candidate: Date = new Date(Date.UTC(year, month - 1, day));
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
  }

  static rangeProblem(from: string, to: string): RangeProblem | null {
    if (!from || !to) return "incomplete";
    if (!FinanceUrlState.isCalendarDate(from) || !FinanceUrlState.isCalendarDate(to)) return "invalid";
    if (from > to) return "inverted";
    return null;
  }

  static sameRange(left: CollectionRange, right: CollectionRange): boolean {
    return left.from === right.from && left.to === right.to;
  }

  static debtFilters(view: DebtorsViewState): DebtFilters {
    return {
      ...(view.courseId !== null ? { courseId: view.courseId } : {}),
      ...(view.overdueDays !== null ? { overdueDays: view.overdueDays } : {}),
      ...(view.enrollmentStatus ? { enrollmentStatus: view.enrollmentStatus } : {}),
    };
  }

  static paymentFilters(view: PaymentsViewState): PaymentFilters {
    return {
      ...(view.courseId !== null ? { courseId: view.courseId } : {}),
      ...(view.method ? { method: view.method } : {}),
    };
  }

  private static parseRange(rawFrom: string | null, rawTo: string | null): CollectionRange | null {
    if (rawFrom === null || rawTo === null) return null;
    return FinanceUrlState.rangeProblem(rawFrom, rawTo) === null ? { from: rawFrom, to: rawTo } : null;
  }

  private static parsePositiveInteger(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const parsed: number = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }

  private static parseOverdueDays(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const parsed: number = Number(raw);
    return Number.isSafeInteger(parsed) && parsed <= FinanceUrlState.maximumOverdueDays ? parsed : null;
  }
}
