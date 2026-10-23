/**
 * Request/response models for /api/v1/auth/*, derived from
 * http://35.228.205.63:8001/api/v1/openapi.json.
 */

export interface LoginRequest {
  login: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface SetPasswordRequest {
  new_password: string;
}

export type PasswordResetSmsChannel = "student_phone" | "parent_phone";

export interface PasswordResetRequest {
  login: string;
  channel?: PasswordResetSmsChannel;
}

export interface PasswordResetVerifyRequest {
  email: string;
  code: string;
}

export interface PasswordResetConfirmRequest {
  reset_token: string;
  new_password: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  must_set_password: boolean;
}

/**
 * The spec types this response as a bare `object` (additionalProperties: true,
 * no declared fields). `reset_token` is assumed by analogy with
 * PasswordResetConfirmRequest's field of the same name, not guaranteed by the
 * schema. Verify against the live server if password-reset/confirm starts
 * rejecting the token.
 */
export interface PasswordResetVerifyResponse {
  reset_token: string;
  [key: string]: unknown;
}

export interface PasswordResetRequestResponse {
  message: "If the account exists, a reset message has been sent.";
}

export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface HTTPValidationError {
  detail: ValidationErrorItem[];
}

export interface ApiErrorCodeDetail {
  code: string;
  message?: string;
}
