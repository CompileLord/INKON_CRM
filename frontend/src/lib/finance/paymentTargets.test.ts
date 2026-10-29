import { describe, expect, it } from "vitest";
import { AuthApiError } from "../auth/errors";
import { PaymentTargets } from "./paymentTargets";
import type { PaymentOption } from "./types";

function option(enrollmentId: number, debt: string, maximum: string, billingMode: string = "paid"): PaymentOption {
  return { enrollment_id: enrollmentId, course_id: enrollmentId + 100, course_title: `Course ${enrollmentId}`, open_debt: debt, overdue_days: 3, remaining_contract_maximum: maximum, billing_mode: billingMode };
}

describe("PaymentTargets.plan", () => {
  const options: PaymentOption[] = [option(1, "750", "900"), option(2, "500", "500"), option(3, "0", "0", "grant")];

  it("sums decimal strings exactly and keeps only non-zero rows", () => {
    const plan = PaymentTargets.plan(options, { 1: "0,1", 2: "0.2", 3: "" });
    expect(plan.total).toBe("0.3");
    expect(plan.targets).toEqual([
      { enrollment_id: 1, amount: "0.1" },
      { enrollment_id: 2, amount: "0.2" },
    ]);
  });

  it("reports zero and unparsable rows as invalid and skips blank ones", () => {
    const plan = PaymentTargets.plan(options, { 1: "0", 2: "abc" });
    expect(plan.targets).toEqual([]);
    expect(plan.total).toBe("0");
    expect(plan.invalidEnrollmentIds).toEqual([1, 2]);
  });

  it("keeps very large amounts exact", () => {
    expect(PaymentTargets.plan(options, { 1: "12345678901234567890.12", 2: "0.01" }).total).toBe("12345678901234567890.13");
  });
});

describe("PaymentTargets row rules", () => {
  it("treats zero-maximum enrollments as not payable and grant enrollments owing debt as payable", () => {
    expect(PaymentTargets.isPayable(option(1, "10", "10"))).toBe(true);
    expect(PaymentTargets.isPayable(option(2, "0", "0", "grant"))).toBe(false);
    expect(PaymentTargets.isPayable(option(4, "40", "40", "grant"))).toBe(true);
    expect(PaymentTargets.isPayable(option(3, "0", "0"))).toBe(false);
  });

  it("fills the debt but never above the remaining maximum", () => {
    expect(PaymentTargets.debtFill(option(1, "750", "900"))).toBe("750");
    expect(PaymentTargets.debtFill(option(1, "750", "600"))).toBe("600");
  });
});

describe("PaymentTargets.parseError", () => {
  it("reads every target code, with enrollment and maximum for exceeds-balance", () => {
    const exceeds = new AuthApiError(422, { code: "payment_target_exceeds_balance", enrollment_id: 5, maximum: "120.00" } as never);
    expect(PaymentTargets.parseError(exceeds)).toEqual({ code: "payment_target_exceeds_balance", enrollmentId: 5, maximum: "120.00" });
    for (const code of ["payment_target_sum_mismatch", "invalid_payment_target", "duplicate_payment_target", "payment_target_required"]) {
      expect(PaymentTargets.parseError(new AuthApiError(422, { code }))?.code).toBe(code);
    }
  });

  it("ignores other failures", () => {
    expect(PaymentTargets.parseError(new AuthApiError(422, { code: "something_else" }))).toBeNull();
    expect(PaymentTargets.parseError(new AuthApiError(500, { code: "payment_target_required" }))).toBeNull();
    expect(PaymentTargets.parseError(new Error("x"))).toBeNull();
  });
});

describe("PaymentTargets.clampDrafts", () => {
  it("lowers amounts above the refreshed ceiling and keeps the rest", () => {
    const drafts = { 1: "1195.00", 2: "10", 3: "abc" };
    const clamped = PaymentTargets.clampDrafts([option(1, "1075.00", "1075.00"), option(2, "50", "50"), option(3, "50", "50")], drafts);
    expect(clamped).toEqual({ 1: "1075.00", 2: "10", 3: "abc" });
  });

  it("uses the contract maximum when it is lower than the debt", () => {
    expect(PaymentTargets.clampDrafts([option(1, "500", "300")], { 1: "500" })).toEqual({ 1: "300" });
  });

  it("returns the same object when nothing changes", () => {
    const drafts = { 1: "5" };
    expect(PaymentTargets.clampDrafts([option(1, "10", "10")], drafts)).toBe(drafts);
  });
});
