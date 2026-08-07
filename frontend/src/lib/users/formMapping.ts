import { AuthApiError, NetworkError } from "../auth/errors";
import type { UserCreate, UserUpdate } from "./types";

/**
 * Shared shape for both the Student and Mentor create/edit forms — role is
 * fixed by which page you're on, not a form field. `<input type="date">`
 * already round-trips as a plain "YYYY-MM-DD" string, so no Date object
 * touches this path (see dates.ts for where that conversion matters).
 */
export interface UserFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  parentTelegramChatId: string;
  parentPhone: string;
  paymentDay: string;
}

export const userFormDefaults: UserFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  parentTelegramChatId: "",
  parentPhone: "",
  paymentDay: "",
};

interface ExistingUserFields {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  parent_telegram_chat_id: number | null;
  parent_phone?: string | null;
  payment_day_of_month: number | null;
}

export function buildUserFormValues(user?: ExistingUserFields): UserFormValues {
  if (!user) return userFormDefaults;

  return {
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone ?? "",
    birthDate: user.date_of_birth ?? "",
    parentTelegramChatId:
      user.parent_telegram_chat_id != null ? String(user.parent_telegram_chat_id) : "",
    parentPhone: user.parent_phone ?? "",
    paymentDay: user.payment_day_of_month != null ? String(user.payment_day_of_month) : "",
  };
}

type UserApiFields = Omit<UserCreate, "role">;

function toApiFields(values: UserFormValues): UserApiFields {
  return {
    email: values.email.trim(),
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    date_of_birth: values.birthDate || null,
    phone: values.phone.trim() || null,
    parent_telegram_chat_id: values.parentTelegramChatId.trim()
      ? Number(values.parentTelegramChatId)
      : null,
    parent_phone: values.parentPhone?.trim() || null,
    payment_day_of_month: values.paymentDay.trim() ? Number(values.paymentDay) : null,
  };
}

export function buildCreatePayload(values: UserFormValues): UserApiFields {
  return toApiFields(values);
}

const FIELD_TO_API_KEY: Record<keyof UserFormValues, keyof UserApiFields> = {
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  phone: "phone",
  birthDate: "date_of_birth",
  parentTelegramChatId: "parent_telegram_chat_id",
  parentPhone: "parent_phone",
  paymentDay: "payment_day_of_month",
};

/** Builds a PATCH payload containing only the keys react-hook-form marked dirty. */
export function buildUpdatePayload(
  values: UserFormValues,
  dirtyFields: Partial<Record<keyof UserFormValues, boolean>>,
): UserUpdate {
  const full = toApiFields(values);
  const update: UserUpdate = {};

  for (const field of Object.keys(dirtyFields) as (keyof UserFormValues)[]) {
    if (!dirtyFields[field]) continue;
    const apiKey = FIELD_TO_API_KEY[field];
    (update as Record<string, unknown>)[apiKey] = full[apiKey];
  }

  return update;
}

const API_KEY_TO_FIELD: Record<string, keyof UserFormValues> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  date_of_birth: "birthDate",
  parent_telegram_chat_id: "parentTelegramChatId",
  parent_phone: "parentPhone",
  payment_day_of_month: "paymentDay",
};

/** Maps AuthApiError.fieldErrors (API key names) onto react-hook-form's setError. Returns whether any field matched. */
export function applyFieldErrors(
  fieldErrors: Record<string, string>,
  setError: (field: keyof UserFormValues, error: { type: string; message: string }) => void,
): boolean {
  let applied = false;
  for (const [apiKey, message] of Object.entries(fieldErrors)) {
    const field = API_KEY_TO_FIELD[apiKey];
    if (field) {
      setError(field, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}

/**
 * A response with a status code — even 500 — reached the browser and is
 * therefore NOT a connection error; only NetworkError (no response object
 * at all: timeout, offline, CORS-blocked) means that. Keep 401/403/5xx on
 * fixed, friendly wording and let every other status through as the
 * server's own `detail`, matching the convention already established by
 * describeAuthError for the login screens.
 */
export function describeUserApiError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.status === 403) return "Недостаточно прав для этого действия";
    if (err.status >= 500) return "Сервер недоступен, попробуйте позже";
    return err.message;
  }
  if (err instanceof NetworkError) return "Не удалось подключиться к серверу";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

export const EMAIL_TAKEN_MESSAGE = "Этот email уже используется";

/**
 * There's no confirmed, stable error contract for "this email is already
 * taken" yet — as of writing the backend returns a bare 500 for it (a
 * server bug, tracked separately) instead of a clean 400/409. This matches
 * defensively on likely future shapes (a 400/409/422 whose detail mentions
 * the email already existing) so the email-specific UI in the form starts
 * working the moment the backend's response becomes well-formed, without
 * needing another frontend change. Tighten this once the real contract is
 * confirmed.
 */
export function isDuplicateEmailError(err: unknown): boolean {
  if (!(err instanceof AuthApiError)) return false;
  if (![400, 409, 422].includes(err.status)) return false;

  const message = typeof err.detail === "string" ? err.detail : err.message;
  const normalized = message.toLowerCase();
  const mentionsEmail = normalized.includes("email") || Boolean(err.fieldErrors.email);
  const mentionsDuplicate = /already exists|already in use|already registered|уже существ|уже использ|уже занят/.test(
    normalized,
  );

  return mentionsEmail && mentionsDuplicate;
}
