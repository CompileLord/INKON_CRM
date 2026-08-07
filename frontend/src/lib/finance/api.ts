import { httpClient } from "../auth/httpClient";
import type {
  AccountingPeriodItem,
  AdjustmentCreatePayload,
  AllocationCreatePayload,
  ChargeItem,
  DebtItem,
  DiscountCreatePayload,
  FinanceAnalyticsResponse,
  LedgerEntryItem,
  PaymentCreatePayload,
  PaymentItem,
  PaymentReceipt,
  RefundPaymentPayload,
  StudentBalanceResponse,
  StudentCreditItem,
  StudentLedgerRow,
  VoidPaymentPayload,
} from "./types";
import type { Paginated } from "../pagination";

export interface PaymentFilters {
  studentId?: number;
  courseId?: number;
  method?: string;
  recordedBy?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface DebtFilters {
  courseId?: number;
  minDebt?: number;
  overdueDays?: number;
  enrollmentStatus?: string;
}

export async function fetchFinanceAnalytics(
  dateFrom?: string,
  dateTo?: string
): Promise<FinanceAnalyticsResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.append("date_from", dateFrom);
  if (dateTo) params.append("date_to", dateTo);
  const response = await httpClient.get(`/finance/analytics/?${params.toString()}`);
  return response.data;
}

export async function fetchPayments(
  page = 1,
  pageSize = 20,
  filters: PaymentFilters = {}
): Promise<Paginated<PaymentItem>> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (filters.studentId) params.append("student_id", filters.studentId.toString());
  if (filters.courseId) params.append("course_id", filters.courseId.toString());
  if (filters.method) params.append("method", filters.method);
  if (filters.recordedBy) params.append("recorded_by", filters.recordedBy.toString());
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);

  const response = await httpClient.get(`/finance/payments/?${params.toString()}`);
  return response.data;
}

export async function fetchDebts(
  page = 1,
  pageSize = 20,
  filters: DebtFilters = {}
): Promise<Paginated<DebtItem>> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (filters.courseId) params.append("course_id", filters.courseId.toString());
  if (filters.minDebt !== undefined) params.append("min_debt", filters.minDebt.toString());
  if (filters.overdueDays !== undefined) params.append("overdue_days", filters.overdueDays.toString());
  if (filters.enrollmentStatus) params.append("enrollment_status", filters.enrollmentStatus);

  const response = await httpClient.get(`/finance/debts/?${params.toString()}`);
  return response.data;
}

export async function fetchCharges(
  page = 1,
  pageSize = 20,
  studentId?: number,
  status?: string
): Promise<Paginated<ChargeItem>> {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (studentId) params.append("student_id", studentId.toString());
  if (status) params.append("status", status);

  const response = await httpClient.get(`/finance/charges/?${params.toString()}`);
  return response.data;
}

export async function fetchStudentCredits(): Promise<StudentCreditItem[]> {
  const response = await httpClient.get("/finance/credits/");
  return response.data;
}

export async function createPayment(payload: PaymentCreatePayload): Promise<PaymentItem> {
  const response = await httpClient.post("/finance/payments/", payload);
  return response.data;
}

export async function voidPayment(id: number, payload: VoidPaymentPayload): Promise<LedgerEntryItem> {
  const response = await httpClient.post(`/finance/payments/${id}/void`, payload);
  return response.data;
}

export async function refundPayment(id: number, payload: RefundPaymentPayload): Promise<LedgerEntryItem> {
  const response = await httpClient.post(`/finance/payments/${id}/refund`, payload);
  return response.data;
}

export async function createDiscount(payload: DiscountCreatePayload): Promise<LedgerEntryItem> {
  const response = await httpClient.post("/finance/discounts/", payload);
  return response.data;
}

export async function createAdjustment(payload: AdjustmentCreatePayload): Promise<LedgerEntryItem> {
  const response = await httpClient.post("/finance/adjustments/", payload);
  return response.data;
}

export async function allocateCredit(payload: AllocationCreatePayload): Promise<LedgerEntryItem | null> {
  const response = await httpClient.post("/finance/allocations/", payload);
  return response.data;
}

export async function fetchStudentLedger(studentId: number): Promise<StudentLedgerRow[]> {
  const response = await httpClient.get(`/finance/students/${studentId}/ledger`);
  return response.data;
}

export async function fetchStudentBalance(studentId: number): Promise<StudentBalanceResponse> {
  const response = await httpClient.get(`/finance/students/${studentId}/balance`);
  return response.data;
}

export async function fetchPaymentReceipt(paymentId: number): Promise<PaymentReceipt> {
  const response = await httpClient.get(`/finance/payments/${paymentId}/receipt`);
  return response.data;
}

export async function closePeriod(
  year: number,
  month: number,
  comment?: string
): Promise<AccountingPeriodItem> {
  const response = await httpClient.post(`/finance/periods/${year}/${month}/close`, { comment });
  return response.data;
}

/** The backend requires a reason_code here — `comment` alone is rejected. */
export async function reopenPeriod(
  year: number,
  month: number,
  reasonCode: string
): Promise<AccountingPeriodItem> {
  const response = await httpClient.post(`/finance/periods/${year}/${month}/reopen`, {
    reason_code: reasonCode,
  });
  return response.data;
}
