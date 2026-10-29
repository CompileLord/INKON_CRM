import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { AuthApiError } from "./errors";
import { ApiErrorCodes } from "./apiErrorCodes";
import { enrollFailureKey } from "../../components/courses/enrollFailureKey";
import { PaymentSubmissionOutcome } from "../finance/paymentSubmissionOutcome";
import { describeCourseApiError } from "../courses/formMapping";

const translate = (key: string, options?: Record<string, unknown>): string => String(i18n.t(key, options));

describe("ApiErrorCodes", () => {
  it("translates every new backend code in every language", async () => {
    const errors: AuthApiError[] = [
      new AuthApiError(409, { code: "phone_taken" }),
      new AuthApiError(409, { code: "email_taken" }),
      new AuthApiError(422, "course_already_ended"),
      new AuthApiError(422, { code: "mentor_role_required" }),
      new AuthApiError(409, { code: "mentor_has_active_courses", course_count: 2 }),
      new AuthApiError(422, { code: "discount_charge_not_open" }),
      new AuthApiError(409, { code: "idempotency_key_payload_mismatch" }),
    ];
    for (const language of ["en", "ru", "tg"]) {
      await i18n.changeLanguage(language);
      for (const error of errors) {
        const message: string | null = ApiErrorCodes.translate(error, translate);
        expect(message).not.toBeNull();
        expect(message).not.toMatch(/apiErrors|_|\{\{/);
      }
    }
  });

  it("says how many active courses the mentor has", async () => {
    await i18n.changeLanguage("ru");
    expect(ApiErrorCodes.translate(new AuthApiError(409, { code: "mentor_has_active_courses", course_count: 4 }), translate)).toContain("4");
  });

  it("returns null for unknown codes", () => {
    expect(ApiErrorCodes.translate(new AuthApiError(409, { code: "something_else" }), translate)).toBeNull();
  });

  it("classifies course_already_ended in both detail shapes", () => {
    expect(enrollFailureKey(new AuthApiError(422, "course_already_ended"))).toBe("courseAlreadyEnded");
    expect(enrollFailureKey(new AuthApiError(422, { code: "course_already_ended" }))).toBe("courseAlreadyEnded");
  });

  it("classifies an idempotency mismatch as its own confirmed rejection", () => {
    const kind = PaymentSubmissionOutcome.classify(new AuthApiError(409, { code: "idempotency_key_payload_mismatch" }));
    expect(kind).toBe("idempotencyMismatch");
    expect(PaymentSubmissionOutcome.isConfirmedRejection(kind)).toBe(true);
  });

  it("names the mentor requirement on the course form", () => {
    expect(describeCourseApiError(new AuthApiError(422, { code: "mentor_role_required" }), (key: string) => key)).toBe("common:apiErrors.mentorRoleRequired");
  });
});
