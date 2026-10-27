import { describe, expect, it } from "vitest";
import { AuthApiError, NetworkError } from "../auth/errors";
import { PaymentSubmissionOutcome } from "./paymentSubmissionOutcome";

describe("payment submission outcome", () => {
  it("treats a missing response or a server error as ambiguous, never as a confirmed rejection", () => {
    for (const failure of [new NetworkError(), new AuthApiError(500, "boom"), new AuthApiError(502, undefined), new Error("timeout")]) {
      const kind = PaymentSubmissionOutcome.classify(failure);
      expect(kind).toBe("ambiguous");
      expect(PaymentSubmissionOutcome.isConfirmedRejection(kind)).toBe(false);
    }
  });

  it("classifies confirmed client rejections by cause", () => {
    expect(PaymentSubmissionOutcome.classify(new AuthApiError(403, "Forbidden"))).toBe("permission");
    expect(PaymentSubmissionOutcome.classify(new AuthApiError(400, "Accounting period closed"))).toBe("closedPeriod");
    expect(PaymentSubmissionOutcome.classify(new AuthApiError(400, "Student is not enrolled in this course"))).toBe("enrollment");
    expect(PaymentSubmissionOutcome.classify(new AuthApiError(422, undefined))).toBe("rejected");
    expect(PaymentSubmissionOutcome.classify(new AuthApiError(422, "withdrawn_enrollment_payment_exceeds_debt"))).toBe("withdrawnExceedsDebt");
    expect(PaymentSubmissionOutcome.isConfirmedRejection("rejected")).toBe(true);
  });
});
