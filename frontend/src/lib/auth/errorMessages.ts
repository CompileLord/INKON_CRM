import { AuthApiError, NetworkError } from "./errors";

/**
 * Shared status → message mapping for the login/verify-code/set-password
 * screens. 422 is handled separately by each form (field-level errors), so
 * it's not mapped here — callers should check for it first.
 */
export function describeAuthError(err: unknown, wrongCredentialsMessage: string): string {
  if (err instanceof AuthApiError) {
    if (err.status === 401) return wrongCredentialsMessage;
    if (err.status === 403) return "Доступ запрещён";
    if (err.status >= 500) return "Сервер недоступен, попробуйте позже";
    return err.message;
  }
  if (err instanceof NetworkError) return "Сервер недоступен, попробуйте позже";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
