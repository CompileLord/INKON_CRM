import type { PaymentAllocationItem } from "./types";

export type PaymentAllocationSummaryKind =
  | { kind: "none" }
  | { kind: "single"; courseTitle: string }
  | { kind: "many"; courseCount: number };

export class PaymentAllocationSummary {
  static of(allocations: readonly PaymentAllocationItem[]): PaymentAllocationSummaryKind {
    const titlesByCourse: Map<number, string> = new Map();
    for (const allocation of allocations) titlesByCourse.set(allocation.course_id, allocation.course_title);
    if (titlesByCourse.size === 0) return { kind: "none" };
    if (titlesByCourse.size === 1) return { kind: "single", courseTitle: [...titlesByCourse.values()][0] };
    return { kind: "many", courseCount: titlesByCourse.size };
  }
}
