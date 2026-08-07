import axios, { type AxiosError } from "axios";
import { API_BASE_URL } from "./env";
import { AuthApiError, NetworkError } from "./errors";
import { emitLogout } from "./session";
import { tokenStorage } from "./tokenStorage";
import type { HTTPValidationError, TokenPair, ValidationErrorItem } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Skip Authorization header injection and 401 refresh handling for this call. */
    skipAuth?: boolean;
    /** Internal: marks a request already retried once after a refresh. */
    _retried?: boolean;
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

let refreshPromise: Promise<TokenPair> | null = null;

function performRefresh(): Promise<TokenPair> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return Promise.reject(new Error("No refresh token available"));

  return httpClient
    .post<TokenPair>("/auth/refresh", { refresh_token: refreshToken }, { skipAuth: true })
    .then((res) => res.data);
}

/** Deduped: concurrent 401s across in-flight requests share one refresh call. */
function refreshAccessToken(): Promise<TokenPair> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function detailFrom(data: unknown): string | ValidationErrorItem[] | undefined {
  return (data as HTTPValidationError | { detail?: string } | undefined)?.detail;
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
      try {
        const tokens = await refreshAccessToken();
        tokenStorage.setTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        });
        config._retried = true;
        return await httpClient.request(config);
      } catch {
        tokenStorage.clear();
        emitLogout();
        throw new AuthApiError(401, detailFrom(data));
      }
    }

    throw new AuthApiError(status, detailFrom(data));
  },
);
