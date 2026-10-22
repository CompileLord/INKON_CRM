import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  allocateCredit,
  closePeriod,
  createAdjustment,
  createDiscount,
  createPayment,
  fetchCharges,
  fetchDebts,
  fetchFinanceAnalytics,
  fetchPaymentReceipt,
  fetchPayments,
  queueDebtReminders,
  fetchStudentBalance,
  fetchStudentCredits,
  fetchStudentLedger,
  refundPayment,
  reopenPeriod,
  voidPayment,
  type DebtFilters,
  type PaymentFilters,
} from "./api";
import { listEnrollments } from "../enrollments/endpoints";
import { getSchoolCalendarDate } from "../../i18n/formatters";
import { PayableCourses } from "./payableCourses";
import { PaymentDateBounds } from "./paymentDateBounds";
import { PaymentIdempotencyKeys } from "./paymentIdempotencyKey";
import type {
  PaymentItem,
  AdjustmentCreatePayload,
  AllocationCreatePayload,
  DiscountCreatePayload,
  PaymentCreatePayload,
  RefundPaymentPayload,
  VoidPaymentPayload,
} from "./types";

/** Every finance mutation invalidates this root so balances never go stale. */
const FINANCE_KEY = ["finance"];

export function useFinanceAnalytics(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["finance", "analytics", dateFrom, dateTo],
    queryFn: () => fetchFinanceAnalytics(dateFrom, dateTo),
  });
}

export function usePayments(page = 1, pageSize = 20, filters: PaymentFilters = {}) {
  return useQuery({
    queryKey: ["finance", "payments", page, pageSize, filters],
    queryFn: () => fetchPayments(page, pageSize, filters),
  });
}

export function useDebts(page = 1, pageSize = 20, filters: DebtFilters = {}) {
  return useQuery({
    queryKey: ["finance", "debts", page, pageSize, filters],
    queryFn: () => fetchDebts(page, pageSize, filters),
  });
}

export function useCharges(page = 1, pageSize = 20, studentId?: number, status?: string) {
  return useQuery({
    queryKey: ["finance", "charges", page, pageSize, studentId, status],
    queryFn: () => fetchCharges(page, pageSize, studentId, status),
  });
}

export function useStudentCredits() {
  return useQuery({
    queryKey: ["finance", "credits"],
    queryFn: () => fetchStudentCredits(),
  });
}

export function usePaymentReceipt(paymentId: number | null) {
  return useQuery({
    queryKey: ["finance", "receipt", paymentId],
    queryFn: () => fetchPaymentReceipt(paymentId as number),
    enabled: !!paymentId,
  });
}

function useFinanceMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FINANCE_KEY });
    },
  });
}

export function useQueueDebtReminders() {
  return useFinanceMutation((studentIds: number[]) => queueDebtReminders(studentIds));
}

export function useCreatePayment() {
  const idempotencyKeys = useRef<PaymentIdempotencyKeys>(new PaymentIdempotencyKeys());
  return useFinanceMutation(async (payload: PaymentCreatePayload) => {
    const key: string = idempotencyKeys.current.keyFor(payload);
    const payment: PaymentItem = await createPayment(payload, key);
    idempotencyKeys.current.release(key);
    return payment;
  });
}

export function useVoidPayment() {
  return useFinanceMutation(({ id, payload }: { id: number; payload: VoidPaymentPayload }) =>
    voidPayment(id, payload)
  );
}

export function useRefundPayment() {
  return useFinanceMutation(({ id, payload }: { id: number; payload: RefundPaymentPayload }) =>
    refundPayment(id, payload)
  );
}

export function useCreateDiscount() {
  return useFinanceMutation((payload: DiscountCreatePayload) => createDiscount(payload));
}

export function useCreateAdjustment() {
  return useFinanceMutation((payload: AdjustmentCreatePayload) => createAdjustment(payload));
}

export function useAllocateCredit() {
  return useFinanceMutation((payload: AllocationCreatePayload) => allocateCredit(payload));
}

export function useStudentLedger(studentId: number) {
  return useQuery({
    queryKey: ["finance", "ledger", studentId],
    queryFn: () => fetchStudentLedger(studentId),
    enabled: !!studentId,
  });
}

export function useStudentBalance(studentId: number) {
  return useQuery({
    queryKey: ["finance", "balance", studentId],
    queryFn: () => fetchStudentBalance(studentId),
    enabled: !!studentId,
  });
}

export function useClosePeriod() {
  return useFinanceMutation(({ year, month, comment }: { year: number; month: number; comment?: string }) =>
    closePeriod(year, month, comment)
  );
}

export function useReopenPeriod() {
  return useFinanceMutation(
    ({ year, month, reasonCode }: { year: number; month: number; reasonCode: string }) =>
      reopenPeriod(year, month, reasonCode)
  );
}

const STATUS_LOOKUP_PAGE_SIZE: number = 100;

export interface PaymentStatusLookup {
  payment: PaymentItem;
  isStale: boolean;
  isRefreshing: boolean;
  retry: () => void;
}

export function usePaymentStatus(knownPayment: PaymentItem | null): PaymentStatusLookup | null {
  const paymentDay: string | null = knownPayment ? getSchoolCalendarDate(new Date(knownPayment.paid_at)) : null;
  const lookup = useQuery({
    queryKey: ["finance", "payment-status", knownPayment?.id ?? null],
    queryFn: () =>
      fetchPayments(1, STATUS_LOOKUP_PAGE_SIZE, {
        studentId: (knownPayment as PaymentItem).student_id,
        ...PaymentDateBounds.toFilters({ from: paymentDay, to: paymentDay }),
      }),
    enabled: knownPayment !== null,
  });
  if (knownPayment === null) return null;
  const fresh: PaymentItem | undefined = lookup.data?.items.find((candidate) => candidate.id === knownPayment.id);
  return {
    payment: fresh ? { ...knownPayment, ...fresh } : knownPayment,
    isStale: lookup.isError || (lookup.isSuccess && !fresh),
    isRefreshing: lookup.isFetching,
    retry: () => void lookup.refetch(),
  };
}

const PAYABLE_COURSES_PAGE_SIZE: number = 100;

export function usePayableCourses(studentId: number | undefined) {
  return useQuery({
    queryKey: ["finance", "payable-courses", studentId],
    queryFn: async () => {
      const [enrollments, charges] = await Promise.all([
        listEnrollments({ student_id: studentId, page: 1, page_size: PAYABLE_COURSES_PAGE_SIZE }),
        fetchCharges(1, PAYABLE_COURSES_PAGE_SIZE, studentId),
      ]);
      return PayableCourses.build(enrollments.items, charges.items);
    },
    enabled: studentId !== undefined,
  });
}
