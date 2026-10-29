import { AuthApiError } from "./errors";

export type ApiErrorTranslator = (key: string, options?: Record<string, unknown>) => string;

const CODE_KEYS: Readonly<Record<string, string>> = {
  phone_taken: "common:apiErrors.phoneTaken",
  email_taken: "common:apiErrors.emailTaken",
  course_already_ended: "common:apiErrors.courseAlreadyEnded",
  mentor_role_required: "common:apiErrors.mentorRoleRequired",
  mentor_has_active_courses: "common:apiErrors.mentorHasActiveCourses",
  discount_charge_not_open: "common:apiErrors.discountChargeNotOpen",
  idempotency_key_payload_mismatch: "common:apiErrors.idempotencyKeyPayloadMismatch",
};

export class ApiErrorCodes {
  static codeOf(error: unknown): string | null {
    if (!(error instanceof AuthApiError)) return null;
    if (error.code !== null) return error.code;
    return typeof error.detail === "string" && error.detail in CODE_KEYS ? error.detail : null;
  }

  static is(error: unknown, code: string): boolean {
    return ApiErrorCodes.codeOf(error) === code;
  }

  static translate(error: unknown, translate: ApiErrorTranslator): string | null {
    const code: string | null = ApiErrorCodes.codeOf(error);
    if (code === null || !(code in CODE_KEYS)) return null;
    const courseCount: unknown = error instanceof AuthApiError && typeof error.detail === "object" && !Array.isArray(error.detail) ? error.detail?.course_count : undefined;
    return translate(CODE_KEYS[code], { courses: typeof courseCount === "number" ? courseCount : 0 });
  }
}
