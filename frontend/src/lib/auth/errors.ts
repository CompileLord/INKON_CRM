import type { ValidationErrorItem } from "./types";

/**
 * Carries the HTTP status and FastAPI's `detail` field verbatim (a plain
 * string for most errors, or the 422 validation array). `fieldErrors` is a
 * convenience map derived from the array form, keyed by the last `loc`
 * segment.
 */
export class AuthApiError extends Error {
  readonly status: number;
  readonly detail: string | ValidationErrorItem[] | undefined;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, detail: string | ValidationErrorItem[] | undefined) {
    super(AuthApiError.messageFor(detail));
    this.name = "AuthApiError";
    this.status = status;
    this.detail = detail;
    this.fieldErrors = AuthApiError.fieldErrorsFor(detail);
  }

  private static messageFor(detail: string | ValidationErrorItem[] | undefined): string {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) return detail[0].msg;
    return "Что-то пошло не так. Попробуйте ещё раз.";
  }

  private static fieldErrorsFor(
    detail: string | ValidationErrorItem[] | undefined,
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
