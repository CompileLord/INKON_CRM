import { describe, expect, it } from "vitest";
import { PaymentAllocationSummary } from "./paymentAllocationSummary";
import type { PaymentAllocationItem } from "./types";

function allocation(chargeId: number, courseId: number, title: string): PaymentAllocationItem {
  return { charge_id: chargeId, course_id: courseId, course_title: title, due_date: "2026-10-05", amount: "10.00" };
}

describe("payment allocation summary", () => {
  it("reports no allocation truthfully", () => {
    expect(PaymentAllocationSummary.of([])).toEqual({ kind: "none" });
  });

  it("reports the single course title even when several charges settle the same course", () => {
    expect(PaymentAllocationSummary.of([allocation(1, 2, "Python")])).toEqual({ kind: "single", courseTitle: "Python" });
    expect(PaymentAllocationSummary.of([allocation(1, 2, "Python"), allocation(2, 2, "Python")])).toEqual({ kind: "single", courseTitle: "Python" });
  });

  it("counts distinct courses, not allocations, when several courses are settled", () => {
    expect(
      PaymentAllocationSummary.of([allocation(1, 2, "Python"), allocation(2, 3, "English"), allocation(3, 3, "English"), allocation(4, 4, "Math")]),
    ).toEqual({ kind: "many", courseCount: 3 });
  });
});
