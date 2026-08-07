/**
 * Request/response models for /api/v1/finance/*.
 *
 * Mirrors the charge/credit ledger described in FINANCE_REDESIGN_PLAN.md.
 * Two things worth remembering when reading these types:
 *
 * - A payment's `amount` is the cash actually received. Discounts are separate
 *   ledger entries (`POST /finance/discounts/`) and never alter a payment.
 * - `net_receivable` is what has come due and is still unpaid. It is not
 *   `gross_contract_value`, which includes installments not yet billed.
 *
 * Regenerate CONTRACT.md (`python -m scripts.generate_contract`) after any
 * backend route change and reconcile this file against it.
 */

export type PaymentMethod = "cash" | "transfer";

export type LedgerEntryType = "payment" | "discount" | "refund" | "adjustment" | "void";
export type ChargeStatus = "open" | "settled" | "cancelled";
export type ChargeType = "tuition" | "fee" | "late_fee";
export type AccountingPeriodStatus = "open" | "closed";
export type EnrollmentStatus = "active" | "withdrawn" | "completed";

export interface PaymentCreatePayload {
  student_id: number;
  course_id: number;
  /** Cash received. Never reduced by a discount. */
  amount: string;
  paid_at: string;
  method: PaymentMethod;
  comment?: string;
}

export interface VoidPaymentPayload {
  reason_code: string;
  comment?: string;
}

export interface RefundPaymentPayload {
  amount: string;
  /** true keeps the value as student credit; false pays cash out. */
  to_wallet?: boolean;
  reason_code: string;
  comment?: string;
}

export interface DiscountCreatePayload {
  student_id: number;
  amount: string;
  charge_id?: number;
  reason_code?: string;
  comment?: string;
  occurred_at?: string;
}

export interface AdjustmentCreatePayload {
  student_id: number;
  amount: string;
  reason_code: string;
  comment?: string;
  occurred_at?: string;
}

export interface AllocationCreatePayload {
  student_id: number;
  charge_id: number;
  amount?: string;
}

export interface AllocationItem {
  id: number;
  ledger_entry_id: number;
  charge_id: number;
  amount: string;
  reversed_by_entry_id?: number | null;
  created_at: string;
}

export interface LedgerEntryItem {
  id: number;
  student_id: number;
  type: LedgerEntryType;
  amount: string;
  method?: PaymentMethod | null;
  occurred_at: string;
  recorded_by_id: number;
  reverses_entry_id?: number | null;
  is_cash_out?: boolean | null;
  reason_code?: string | null;
  comment?: string | null;
  created_at: string;
  allocations?: AllocationItem[];
}

export interface ChargeItem {
  id: number;
  student_id: number;
  enrollment_id: number;
  sequence_no: number;
  type: ChargeType;
  amount: string;
  due_date: string;
  status: ChargeStatus;
  allocated_amount: string;
  remaining_balance: string;
  course_title?: string | null;
}

export interface AccountingPeriodItem {
  id: number;
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  closed_at?: string | null;
  closed_by_id?: number | null;
  reopen_reason?: string | null;
}

export interface PaymentAllocationItem {
  charge_id: number;
  course_id: number;
  course_title: string;
  due_date: string;
  amount: string;
}

export interface PaymentItem {
  id: number;
  student_id: number;
  /** Cash received. */
  amount: string;
  paid_at: string;
  method?: PaymentMethod | null;
  recorded_by_id: number;
  comment?: string | null;
  created_at: string;
  allocated_amount: string;
  unallocated_amount: string;
  is_voided: boolean;
  refunded_amount: string;
  /** Which charges this payment settled — a payment can span courses. */
  allocations: PaymentAllocationItem[];
}

export interface StudentCreditItem {
  student_id: number;
  student_name: string;
  email: string;
  credit_balance: string;
}

export interface ReceiptAllocationItem {
  charge_id: number;
  charge_type: string;
  course_title: string;
  due_date: string;
  allocated_amount: string;
}

export interface PaymentReceipt {
  receipt_number: string;
  occurred_at: string;
  student_id: number;
  student_name: string;
  student_email: string;
  amount: string;
  method?: PaymentMethod | null;
  accepted_by_name: string;
  allocations: ReceiptAllocationItem[];
  comment?: string | null;
}

export interface DebtItem {
  student: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    payment_day_of_month: number | null;
  };
  course: {
    id: number;
    title: string;
  };
  /** Contracted total — not the amount owed. */
  price_at_enrollment: string;
  /** Installments that have come due. */
  billed_to_date: string;
  total_paid: string;
  debt: string;
  overdue_days: number;
}

export interface DebtorPreview {
  student_id: number;
  first_name: string;
  last_name: string;
  email: string;
  debt: string;
}

export interface AgingBuckets {
  d0_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
}

export interface FinanceAnalyticsResponse {
  gross_contract_value: string;
  billed_to_date: string;
  billed_in_period: string;
  net_receivable: string;
  collected_in_period: string;
  outstanding_credit: string;
  aging: AgingBuckets;
  unpaid_students_count: number;
  collection_rate: string;
  debtors_preview: DebtorPreview[];
}

export interface StudentBalanceResponse {
  student_id: number;
  billed_to_date: string;
  total_settled: string;
  net_receivable: string;
  credit_balance: string;
  days_overdue: number;
}

export interface StudentLedgerRow {
  kind: "charge" | "entry";
  id: number;
  type: string;
  amount: string;
  due_date?: string;
  status?: ChargeStatus;
  sequence_no?: number;
  remaining_balance?: string;
  method?: PaymentMethod | null;
  occurred_at?: string;
  reason_code?: string | null;
  comment?: string | null;
  reverses_entry_id?: number | null;
  is_cash_out?: boolean | null;
}
