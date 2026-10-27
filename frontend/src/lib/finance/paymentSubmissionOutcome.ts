import { AuthApiError } from "../auth/errors";

export type PaymentFailureKind = "ambiguous" | "permission" | "closedPeriod" | "enrollment" | "withdrawnExceedsDebt" | "rejected";

export class PaymentSubmissionOutcome {
  static classify(failure: unknown): PaymentFailureKind {
    if (!(failure instanceof AuthApiError) || failure.status < 400 || failure.status >= 500) return "ambiguous";
    if (failure.status === 403) return "permission";
    const detail: string = typeof failure.detail === "string" ? failure.detail.toLowerCase() : "";
    if (failure.status === 422 && detail === "withdrawn_enrollment_payment_exceeds_debt") return "withdrawnExceedsDebt";
    if (detail.includes("closed")) return "closedPeriod";
    if (detail.includes("enrolled")) return "enrollment";
    return "rejected";
  }

  static isConfirmedRejection(kind: PaymentFailureKind): boolean {
    return kind !== "ambiguous";
  }
}
