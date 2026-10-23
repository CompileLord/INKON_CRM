import { AuthApiError, NetworkError } from "./errors";
import { PasswordPolicyViolation } from "./passwordPolicy";

export type AuthErrorKind =
  | "invalidCredentials"
  | "forbidden"
  | "rateLimited"
  | "serverError"
  | "networkError"
  | "genericError";

export function getAuthErrorKind(err: unknown): AuthErrorKind {
  if (err instanceof AuthApiError) {
    if (err.status === 401) return "invalidCredentials";
    if (err.status === 403) return "forbidden";
    if (err.status === 429) return "rateLimited";
    if (err.status >= 500) return "serverError";
    return "genericError";
  }
  if (err instanceof NetworkError) return "networkError";
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) return "networkError";
  return "genericError";
}

export interface MappedFieldError<T extends string = "login" | "email" | "password"> {
  field: T;
  messageKey: string;
  params?: Record<string, unknown>;
}

export interface ValidationMappingResult<T extends string = "login" | "email" | "password"> {
  fieldErrors: MappedFieldError<T>[];
  formErrorKey: AuthErrorKind | null;
}

export function mapValidationError(detail: unknown): ValidationMappingResult {
  const fieldErrors: MappedFieldError[] = [];
  if (!Array.isArray(detail) || detail.length === 0) {
    return { fieldErrors: [], formErrorKey: "genericError" };
  }

  let hasUnknownField = false;

  for (const item of detail) {
    if (!item || typeof item !== "object") {
      hasUnknownField = true;
      continue;
    }
    const loc = Array.isArray((item as { loc?: unknown[] }).loc)
      ? (item as { loc: unknown[] }).loc
      : [];
    if (loc.length === 0) {
      hasUnknownField = true;
      continue;
    }
    const field = loc[loc.length - 1];
    const type = typeof (item as { type?: unknown }).type === "string"
      ? (item as { type: string }).type
      : "";

    if (field === "email") {
      if (type === "missing") {
        fieldErrors.push({ field: "email", messageKey: "validation:required" });
      } else if (
        type === "email_parsing" ||
        type === "value_error.email" ||
        (type === "value_error" &&
          typeof (item as { ctx?: { reason?: unknown } }).ctx?.reason === "string")
      ) {
        fieldErrors.push({ field: "email", messageKey: "validation:invalidEmail" });
      } else {
        fieldErrors.push({ field: "email", messageKey: "auth:genericError" });
      }
    } else if (field === "login") {
      if (type === "missing") {
        fieldErrors.push({ field: "login", messageKey: "validation:required" });
      } else {
        fieldErrors.push({ field: "login", messageKey: "validation:invalidLogin" });
      }
    } else if (field === "password") {
      if (type === "missing") {
        fieldErrors.push({ field: "password", messageKey: "validation:required" });
      } else {
        fieldErrors.push({ field: "password", messageKey: "auth:genericError" });
      }
    } else {
      hasUnknownField = true;
    }
  }

  const formErrorKey =
    fieldErrors.length === 0 || hasUnknownField ? "genericError" : null;

  return { fieldErrors, formErrorKey };
}

export function mapSetPasswordError(err: unknown): {
  fieldErrors: MappedFieldError<"newPassword" | "confirmPassword">[];
  formErrorKey: string | null;
} {
  if (err instanceof AuthApiError) {
    if (err.status === 422) {
      const fieldErrors: MappedFieldError<"newPassword" | "confirmPassword">[] = [];
      let hasUnknownOrArbitrary = false;
      if (Array.isArray(err.detail) && err.detail.length > 0) {
        for (const item of err.detail) {
          if (!item || typeof item !== "object") {
            hasUnknownOrArbitrary = true;
            continue;
          }
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? (item as { loc: unknown[] }).loc
            : [];
          const field = loc[loc.length - 1];
          const type = typeof (item as { type?: unknown }).type === "string"
            ? (item as { type: string }).type
            : "";

          if (field === "new_password" || field === "newPassword") {
            if (type === "missing") {
              fieldErrors.push({ field: "newPassword", messageKey: "validation:required" });
            } else if (type === "string_too_short") {
              fieldErrors.push({
                field: "newPassword",
                messageKey: "validation:passwordMinLength",
                params: { min: 8 },
              });
            } else {
              fieldErrors.push({ field: "newPassword", messageKey: "auth:genericError" });
              hasUnknownOrArbitrary = true;
            }
          } else {
            hasUnknownOrArbitrary = true;
          }
        }
      } else {
        hasUnknownOrArbitrary = true;
      }
      return {
        fieldErrors,
        formErrorKey: fieldErrors.length === 0 || hasUnknownOrArbitrary ? "genericError" : null,
      };
    }
    if (err.status === 400) {
      if (PasswordPolicyViolation.matches(err)) {
        return {
          fieldErrors: [{ field: "newPassword", messageKey: "auth:passwordPolicyError" }],
          formErrorKey: null,
        };
      }
      return { fieldErrors: [], formErrorKey: "setPasswordError" };
    }
    if (err.status === 401) {
      return { fieldErrors: [], formErrorKey: "setPasswordError" };
    }
    if (err.status === 404) {
      return { fieldErrors: [], formErrorKey: "userNotFound" };
    }
    if (err.status === 429) {
      return { fieldErrors: [], formErrorKey: "rateLimited" };
    }
    if (err.status >= 500) {
      return { fieldErrors: [], formErrorKey: "serverError" };
    }
    return { fieldErrors: [], formErrorKey: "setPasswordError" };
  }
  if (err instanceof NetworkError) {
    return { fieldErrors: [], formErrorKey: "networkError" };
  }
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
    return { fieldErrors: [], formErrorKey: "networkError" };
  }
  return { fieldErrors: [], formErrorKey: "setPasswordError" };
}

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

export type ChangePasswordErrorField = "currentPassword" | "newPassword";

export interface ChangePasswordErrorMapping {
  field: ChangePasswordErrorField | null;
  messageKey: string;
  params?: Record<string, unknown>;
}

export function mapChangePasswordError(err: unknown): ChangePasswordErrorMapping {
  if (err instanceof AuthApiError) {
    if (err.status === 401 || (err.status === 400 && (err.code === "invalid_current_password" || err.detail === "invalid_current_password"))) {
      return { field: "currentPassword", messageKey: "settings:security.currentPasswordWrong" };
    }
    if (PasswordPolicyViolation.matches(err)) return { field: "newPassword", messageKey: "auth:passwordPolicyError" };
    if (err.status === 400) return { field: null, messageKey: "auth:genericError" };
    if (err.status === 422) return { field: "newPassword", messageKey: "validation:passwordMinLength", params: { min: 8 } };
    if (err.status === 429) return { field: null, messageKey: "auth:rateLimited" };
    if (err.status >= 500) return { field: null, messageKey: "auth:serverError" };
    return { field: null, messageKey: "auth:genericError" };
  }
  if (err instanceof NetworkError) return { field: null, messageKey: "auth:networkError" };
  return { field: null, messageKey: "auth:genericError" };
}
