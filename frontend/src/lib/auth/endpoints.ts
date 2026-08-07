import { httpClient } from "./httpClient";
import type {
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  PasswordResetVerifyRequest,
  PasswordResetVerifyResponse,
  RefreshRequest,
  ResendCodeRequest,
  SetPasswordRequest,
  TokenPair,
  VerifyCodeRequest,
} from "./types";

export function login(email: string, password: string): Promise<TokenPair> {
  const body: LoginRequest = { email, password };
  return httpClient.post<TokenPair>("/auth/login", body, { skipAuth: true }).then((res) => res.data);
}

export function refresh(refreshToken: string): Promise<TokenPair> {
  const body: RefreshRequest = { refresh_token: refreshToken };
  return httpClient.post<TokenPair>("/auth/refresh", body, { skipAuth: true }).then((res) => res.data);
}

/** Revokes refreshToken server-side. Callers must still clear local state themselves. */
export function logout(refreshToken: string): Promise<void> {
  const body: RefreshRequest = { refresh_token: refreshToken };
  return httpClient.post<void>("/auth/logout", body).then(() => undefined);
}

export function verifyCode(email: string, code: string): Promise<TokenPair> {
  const body: VerifyCodeRequest = { email, code };
  return httpClient.post<TokenPair>("/auth/verify-code", body).then((res) => res.data);
}

export function resendCode(email: string): Promise<void> {
  const body: ResendCodeRequest = { email };
  return httpClient.post<void>("/auth/resend-code", body).then(() => undefined);
}

/** Requires an Authorization bearer token — the caller's current access token. */
export function setPassword(newPassword: string): Promise<TokenPair> {
  const body: SetPasswordRequest = { new_password: newPassword };
  return httpClient.post<TokenPair>("/auth/set-password", body).then((res) => res.data);
}

export function passwordResetRequest(email: string): Promise<PasswordResetRequestResponse> {
  const body: PasswordResetRequest = { email };
  return httpClient
    .post<PasswordResetRequestResponse>("/auth/password-reset/request", body, { skipAuth: true })
    .then((res) => res.data);
}

export function passwordResetVerify(
  email: string,
  code: string,
): Promise<PasswordResetVerifyResponse> {
  const body: PasswordResetVerifyRequest = { email, code };
  return httpClient
    .post<PasswordResetVerifyResponse>("/auth/password-reset/verify", body, { skipAuth: true })
    .then((res) => res.data);
}

export function passwordResetConfirm(resetToken: string, newPassword: string): Promise<TokenPair> {
  const body: PasswordResetConfirmRequest = { reset_token: resetToken, new_password: newPassword };
  return httpClient
    .post<TokenPair>("/auth/password-reset/confirm", body, { skipAuth: true })
    .then((res) => res.data);
}
