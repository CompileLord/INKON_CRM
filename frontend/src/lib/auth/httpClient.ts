import axios, { type AxiosError } from "axios";
import { API_BASE_URL } from "./env";
import { AuthApiError, NetworkError, type ApiErrorDetail } from "./errors";
import { MissingRefreshTokenError, RefreshCoordinator } from "./refreshCoordinator";
import { emitLogout, emitSessionRefresh } from "./session";
import { tokenStorage } from "./tokenStorage";
import type { TokenPair } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Skip Authorization header injection and 401 refresh handling for this call. */
    skipAuth?: boolean;
    /** Internal: marks a request already retried once after a refresh. */
    _retried?: boolean;
    /** A 401 whose detail is one of these means wrong credentials, not an expired session: no refresh, no logout. */
    wrongCredentialsDetails?: readonly string[];
    /** A 401 on this call never triggers a refresh (used by logout, whose refresh token is being revoked). */
    skipRefreshOn401?: boolean;
  }
}

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

httpClient.interceptors.request.use((config) => {
  if (!config.skipAuth) {
    const token = tokenStorage.getAccessToken();
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

export const refreshCoordinator: RefreshCoordinator = new RefreshCoordinator({
  locks: RefreshCoordinator.browserLocks(),
  bus: RefreshCoordinator.browserBus(),
  readRefreshToken: (): string | null => tokenStorage.getRefreshToken(),
  requestRefresh: (refreshToken: string): Promise<TokenPair> =>
    httpClient.post<TokenPair>("/auth/refresh", { refresh_token: refreshToken }, { skipAuth: true }).then((res) => res.data),
  persist: (tokens: TokenPair): void => tokenStorage.setTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
  apply: (tokens: TokenPair): void => emitSessionRefresh(tokens),
  now: (): number => Date.now(),
});

function isDefinitiveRejection(error: unknown): boolean {
  return error instanceof MissingRefreshTokenError || (error instanceof AuthApiError && (error.status === 401 || error.status === 403));
}

function detailFrom(data: unknown): ApiErrorDetail {
  return (data as { detail?: ApiErrorDetail } | undefined)?.detail;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (!error.response) {
      throw new NetworkError();
    }

    const { status, data } = error.response;
    const config = error.config;

    if (status === 401 && config && !config.skipAuth && !config._retried) {
      const detail: ApiErrorDetail = detailFrom(data);
      const detailCode: string | null = typeof detail === "string" ? detail : detail && !Array.isArray(detail) ? detail.code : null;
      if (config.skipRefreshOn401 || (detailCode !== null && config.wrongCredentialsDetails?.includes(detailCode))) {
        throw new AuthApiError(status, detail);
      }
      try {
        await refreshCoordinator.refresh();
      } catch (refreshError: unknown) {
        if (isDefinitiveRejection(refreshError)) {
          tokenStorage.clear();
          emitLogout();
          throw new AuthApiError(401, detail);
        }
        throw refreshError;
      }
      config._retried = true;
      return httpClient.request(config);
    }

    const retryAfterHeader: unknown = error.response.headers?.["retry-after"];
    const retryAfterSeconds: number = Number(retryAfterHeader);
    throw new AuthApiError(status, detailFrom(data), retryAfterHeader !== undefined && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null);
  },
);
