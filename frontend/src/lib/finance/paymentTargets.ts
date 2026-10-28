import { AuthApiError } from "../auth/errors";
import { addMoney, compareMoney, isPositiveMoney } from "../money";
import { PaymentAmountParser } from "./paymentAmountParser";
import type { PaymentOption } from "./types";

export type TargetDrafts = Record<number, string>;

export interface PaymentTargetLine {
  enrollment_id: number;
  amount: string;
}

export interface PaymentTargetPlan {
  targets: PaymentTargetLine[];
  total: string;
  invalidEnrollmentIds: number[];
}

export type PaymentTargetErrorCode =
  | "payment_target_sum_mismatch"
  | "payment_target_exceeds_balance"
  | "invalid_payment_target"
  | "duplicate_payment_target"
  | "payment_target_required";

export interface PaymentTargetError {
  code: PaymentTargetErrorCode;
  enrollmentId: number | null;
  maximum: string | null;
}

const TARGET_ERROR_CODES: readonly string[] = [
  "payment_target_sum_mismatch",
  "payment_target_exceeds_balance",
  "invalid_payment_target",
  "duplicate_payment_target",
  "payment_target_required",
];

export type CreditAllocationErrorCode =
  | "invalid_payment_target"
  | "no_wallet_credit"
  | "nothing_to_allocate"
  | "credit_exceeds_available"
  | "payment_target_exceeds_balance";

export interface CreditAllocationError {
  code: CreditAllocationErrorCode;
  maximum: string | null;
}

const CREDIT_ALLOCATION_ERROR_CODES: readonly string[] = [
  "invalid_payment_target",
  "no_wallet_credit",
  "nothing_to_allocate",
  "credit_exceeds_available",
  "payment_target_exceeds_balance",
];

export class PaymentTargets {
  static isPayable(option: PaymentOption): boolean {
    return option.billing_mode !== "grant" && isPositiveMoney(option.remaining_contract_maximum);
  }

  static hasDebt(option: PaymentOption): boolean {
    return PaymentTargets.isPayable(option) && isPositiveMoney(option.open_debt);
  }

  static debtFill(option: PaymentOption): string {
    return compareMoney(option.open_debt, option.remaining_contract_maximum) > 0 ? option.remaining_contract_maximum : option.open_debt;
  }

  static clampDrafts(options: readonly PaymentOption[], drafts: TargetDrafts): TargetDrafts {
    let clamped: TargetDrafts = drafts;
    for (const option of options) {
      const raw: string | undefined = drafts[option.enrollment_id];
      if (raw === undefined) continue;
      const canonical: string | null = PaymentAmountParser.parse(raw).canonical;
      const ceiling: string = PaymentTargets.isPayable(option) ? PaymentTargets.debtFill(option) : "0";
      if (canonical !== null && compareMoney(canonical, ceiling) > 0) clamped = { ...clamped, [option.enrollment_id]: ceiling };
    }
    return clamped;
  }

  static plan(options: readonly PaymentOption[], drafts: TargetDrafts): PaymentTargetPlan {
    const targets: PaymentTargetLine[] = [];
    const invalidEnrollmentIds: number[] = [];
    let total: string = "0";
    for (const option of options) {
      const raw: string = drafts[option.enrollment_id] ?? "";
      if (raw.trim() === "") continue;
      const parsed = PaymentAmountParser.parse(raw);
      if (parsed.canonical !== null) {
        targets.push({ enrollment_id: option.enrollment_id, amount: parsed.canonical });
        total = addMoney(total, parsed.canonical);
      } else if (parsed.problem === "invalid") {
        invalidEnrollmentIds.push(option.enrollment_id);
      }
    }
    return { targets, total, invalidEnrollmentIds };
  }

  static parseError(failure: unknown): PaymentTargetError | null {
    if (!(failure instanceof AuthApiError) || failure.status !== 422) return null;
    const detail: unknown = failure.detail;
    if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
    const record: Record<string, unknown> = detail as Record<string, unknown>;
    const code: unknown = record.code;
    if (typeof code !== "string" || !TARGET_ERROR_CODES.includes(code)) return null;
    return {
      code: code as PaymentTargetErrorCode,
      enrollmentId: typeof record.enrollment_id === "number" ? record.enrollment_id : null,
      maximum: typeof record.maximum === "string" ? record.maximum : null,
    };
  }

  static parseCreditAllocationError(failure: unknown): CreditAllocationError | null {
    if (!(failure instanceof AuthApiError) || failure.status !== 422) return null;
    const detail: unknown = failure.detail;
    if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
    const record: Record<string, unknown> = detail as Record<string, unknown>;
    const code: unknown = record.code;
    if (typeof code !== "string" || !CREDIT_ALLOCATION_ERROR_CODES.includes(code)) return null;
    return { code: code as CreditAllocationErrorCode, maximum: typeof record.maximum === "string" ? record.maximum : null };
  }
}
