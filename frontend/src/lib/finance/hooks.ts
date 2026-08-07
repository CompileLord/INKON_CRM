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
  fetchStudentBalance,
  fetchStudentCredits,
  fetchStudentLedger,
  refundPayment,
  reopenPeriod,
  voidPayment,
  type DebtFilters,
  type PaymentFilters,
} from "./api";
import type {
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

export function useCreatePayment() {
  return useFinanceMutation((payload: PaymentCreatePayload) => createPayment(payload));
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
