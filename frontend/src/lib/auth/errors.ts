import type { ApiErrorCodeDetail, ValidationErrorItem } from "./types";

export type ApiErrorDetail = string | ValidationErrorItem[] | ApiErrorCodeDetail | undefined;

/**
 * Carries the HTTP status and FastAPI's `detail` field verbatim (a plain
 * string for most errors, or the 422 validation array). `fieldErrors` is a
 * convenience map derived from the array form, keyed by the last `loc`
 * segment.
 */
export class AuthApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail;
  readonly fieldErrors: Record<string, string>;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, detail: ApiErrorDetail, retryAfterSeconds: number | null = null) {
    super(AuthApiError.messageFor(detail));
    this.name = "AuthApiError";
    this.status = status;
    this.detail = detail;
    this.fieldErrors = AuthApiError.fieldErrorsFor(detail);
    this.code = AuthApiError.codeFor(detail);
    this.retryAfterSeconds = retryAfterSeconds;
  }

  private static messageFor(detail: ApiErrorDetail): string {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) return detail[0].msg;
    if (AuthApiError.isCodeDetail(detail) && detail.message) return detail.message;
    return "Что-то пошло не так. Попробуйте ещё раз.";
  }

  private static isCodeDetail(detail: ApiErrorDetail): detail is ApiErrorCodeDetail {
    return typeof detail === "object" && detail !== null && !Array.isArray(detail) && typeof (detail as ApiErrorCodeDetail).code === "string";
  }

  private static codeFor(detail: ApiErrorDetail): string | null {
    return AuthApiError.isCodeDetail(detail) ? detail.code : null;
  }

  private static fieldErrorsFor(
    detail: ApiErrorDetail,
  ): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!Array.isArray(detail)) return errors;
    for (const item of detail) {
      const field = item.loc[item.loc.length - 1];
      if (typeof field === "string") errors[field] = item.msg;
    }
    return errors;
  }
}

/** No HTTP response at all: timeout, DNS failure, offline, CORS, etc. */
export class NetworkError extends Error {
  constructor(message = "Не удалось подключиться к серверу. Проверьте интернет-соединение.") {
    super(message);
    this.name = "NetworkError";
  }
}
